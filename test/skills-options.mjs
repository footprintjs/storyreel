/**
 * The options a skill's code passes, held to the functions' own types (types/): every key of an object literal that a
 * typed parameter receives must be a key that type has. It is TypeScript's excess-property check, asked one literal
 * at a time through the type checker (getContextualType), so plain JavaScript examples are checked without the noise
 * a full `tsc --checkJs` makes of them (an array literal is never inferred as a tuple, so every `[scene, phrase]`
 * would be an error there). A type that takes any key (an index signature, unknown, any) checks nothing.
 *
 * One place the types are open on purpose: makeFilm's and makeRelease's `render` is a Record, handed on to renderFilm.
 * Its keys are held to renderFilm's options instead, and so are the literals inside it (`layout`, …).
 *
 *   unknownOptions(files, {dir, exported}) → [{file, line, key, known: [keys]}]   (dir: a folder with the package installed)
 *
 * A literal handed to a function the block never imported has no type to be held to, so a block that calls one of the
 * package's functions without importing it is reported too (`key` null, `name` the function): `exported` is every name
 * the package exports.
 */
import ts from 'typescript';
import path from 'node:path';
import {writeFileSync} from 'node:fs';

const SKIPPED = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Void;

export function unknownOptions(files, {dir, exported = new Set()}) {
  // renderFilm's options, as its type says: the contextual type of the literal a probe hands it.
  const probe = path.join(dir, 'options-probe.mjs');
  writeFileSync(probe, "import {renderFilm} from 'footprint-storyreel';\nrenderFilm({});\n");
  const wanted = new Set(files.map(f => path.resolve(f)));
  const program = ts.createProgram([...files, probe], {allowJs: true, checkJs: true, noEmit: true, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, skipLibCheck: true, types: []});
  const checker = program.getTypeChecker();
  const open = t => Boolean(t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) || checker.getIndexInfosOfType(t).length > 0;
  /** The keys a type takes, or null when it takes any key (or is no object at all). */
  const keysOf = type => {
    const out = new Set();
    let objects = 0;
    for (const t of type.isUnion() ? type.types : [type]) {
      if (t.flags & SKIPPED) continue;
      if (open(t)) return null;
      if (!(t.flags & ts.TypeFlags.Object) && !t.isIntersection()) continue;
      objects++;
      for (const p of checker.getPropertiesOfType(t)) out.add(p.name);
    }
    return objects ? out : null;
  };
  /** The type of `key` in a type (any object member of a union that has it), or null. */
  const typeOfKey = (type, key) => {
    for (const t of type.isUnion() ? type.types : [type]) {
      const prop = !(t.flags & SKIPPED) && checker.getPropertyOfType(t, key);
      if (prop) return checker.getTypeOfSymbol(prop);
    }
    return null;
  };
  const sourceOf = name => program.getSourceFiles().find(sf => path.resolve(sf.fileName) === name);
  const probeFile = sourceOf(path.resolve(probe));
  let renderType = null;
  const findRender = node => { if (ts.isObjectLiteralExpression(node)) renderType = checker.getContextualType(node); else ts.forEachChild(node, findRender); };
  findRender(probeFile);
  if (!renderType || !keysOf(renderType)) throw new Error('unknownOptions: renderFilm\'s options type was not found (is the package installed in dir?)');

  const out = [];
  for (const name of wanted) {
    const sf = sourceOf(name);
    if (!sf) throw new Error(`unknownOptions: ${name} was not read`);
    const report = (node, key, known) => out.push({file: name, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, key, known: [...known].sort()});
    // "Cannot find name" (2304) for one of the package's own names: called, never imported.
    for (const d of program.getSemanticDiagnostics(sf)) {
      const missing = d.code === 2304 && /'([^']+)'/.exec(ts.flattenDiagnosticMessageText(d.messageText, '\n'))?.[1];
      if (missing && exported.has(missing)) out.push({file: name, line: sf.getLineAndCharacterOfPosition(d.start).line + 1, key: null, name: missing, known: []});
    }
    /** One literal against a type it is handed: its keys, and (where the type is known) the literals inside it. */
    const check = (lit, type, deep) => {
      const known = type && keysOf(type);
      if (!known) return;
      for (const p of lit.properties) {
        if (!p.name || ts.isComputedPropertyName(p.name)) continue;   // a spread, a computed key: nothing to read
        const key = p.name.getText().replace(/^['"]|['"]$/g, '');
        if (!known.has(key)) { report(p, key, known); continue; }
        if (deep && ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) check(p.initializer, typeOfKey(type, key), true);
      }
    };
    const visit = node => {
      if (ts.isObjectLiteralExpression(node)) {
        const type = checker.getContextualType(node);
        const isRender = ts.isPropertyAssignment(node.parent) && node.parent.name.getText() === 'render' && (!type || !keysOf(type));
        if (isRender) check(node, renderType, true);
        else if (type) check(node, type, false);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

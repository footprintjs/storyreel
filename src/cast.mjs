/**
 * The cast: who is in the film and how they look, as configuration — so one film can be made again for another
 * language and place (a native hero's name, her clothes, the shop on her street) without touching its recipe or
 * its kits' code.
 *
 *   cast = {<role>: {name, …anything the kit draws them with}}     e.g. {hero: {name: 'Amaira', outfit: 'stripes'}}
 *
 * Text names a role with `{{role}}` — in the storyboard (what is said), the recipe (its phrases and labels) and the
 * string table — and withCast puts the role's name there before anything reads it, so the voice says the name,
 * a beat's phrase finds it, and a card shows it. Kits get the cast as `context.cast` (a story kit with
 * `context: true`) and in a stage kit's compile options, and read the rest of a role (a look, an outfit, a voice)
 * as they choose. The cast is part of what a film is made from (`film.inputs.cast`): an approval locks it.
 *
 * Refuses: a role that is not a word, a role without a name, a {{role}} the cast does not have — naming the fix.
 */
const ROLE = /^[A-Za-z][\w-]*$/, TOKEN = /\{\{\s*([^}]*?)\s*\}\}/g;

/** The cast checked and frozen (deep): {role: {name, …}}; null stays null (a film without a cast). */
export function readCast(cast) {
  if (cast === null || cast === undefined) return null;
  if (typeof cast !== 'object' || Array.isArray(cast)) throw new TypeError('cast is {role: {name, …the look the kits read}}, e.g. {hero: {name: "Amaira"}}');
  for (const [role, who] of Object.entries(cast)) {
    if (!ROLE.test(role)) throw new TypeError(`cast role "${role}" must be a word (letters, digits, - or _), as {{${role}}} names it in the text`);
    if (!who || typeof who !== 'object' || Array.isArray(who)) throw new TypeError(`cast.${role} is {name, …}`);
    if (!(typeof who.name === 'string' && who.name.trim())) throw new TypeError(`cast.${role}.name is the name said and shown for {{${role}}}`);
  }
  return deepFreeze(structuredClone(cast));
}
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

/** One text with every {{role}} replaced by the role's name; a role the cast lacks refuses. */
export function castText(text, cast, where = 'text') {
  return String(text).replace(TOKEN, (_, role) => {
    const who = cast?.[role];
    if (!who) throw new Error(`${where} names {{${role}}}, which the cast does not have (${cast ? `roles: ${Object.keys(cast).join(', ')}` : 'no cast given: pass cast: {' + role + ': {name}}'})`);
    return who.name;
  });
}

/**
 * Any JSON value (a storyboard, a recipe, a string table) with {{role}} replaced in every string, keys untouched.
 * Pure: returns a new value. Without a cast a value with no {{…}} comes back as it is; one with them refuses.
 */
export function withCast(value, cast, where = 'value') {
  if (typeof value === 'string') return value.includes('{{') ? castText(value, cast, where) : value;
  if (Array.isArray(value)) return value.map((v, i) => withCast(v, cast, `${where}[${i}]`));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withCast(v, cast, `${where}.${k}`)]));
  return value;
}

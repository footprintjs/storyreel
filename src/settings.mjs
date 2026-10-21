/**
 * Settings, the one reader. A transition's settings (an entrance's `enter.<name>`) and a thought frame's (`frame.<name>`)
 * are written the same way: {oneOf: [words]}, {point: true}, {color: true}, {number: [min, max]}, {box: true} or
 * {name: true}, each with its default (a colour's may be null: the draw picks it, the theme's say). They are read here,
 * each value checked against its kind and the defaults filled in, and a bad one refuses with the same words wherever it
 * is written. A leaf (it asks colour.mjs only), so transitions.mjs and thought/ share it without a cycle.
 */
import {isHex as isColor} from './colour.mjs';

/** A box on the 1600×900 frame: [x0, y0, x1, y1], numbers, x0 < x1 and y0 < y1. */
export const isBox = v => Array.isArray(v) && v.length === 4 && v.every(Number.isFinite) && v[0] < v[2] && v[1] < v[3];

/**
 * The settings `params` describes, read from `given` (the recipe's object), each checked against its kind, the defaults
 * filled in; frozen. A refusal names the setting as the recipe writes it, `<key>.<name>` (key: 'enter' for a
 * transition, 'frame' for a frame), and what it must be; `type` names what takes it (a "torn", a "thought frame").
 */
export function readSettings(params, given, where, {key = 'enter', type = given?.type} = {}) {
  const out = {};
  for (const [name, spec] of Object.entries(params)) {
    const v = given[name] ?? spec.default, bad = what => new Error(`${where}: ${key}.${name} must be ${what}`);
    if (spec.name && v === undefined) throw new Error(`${where}: a ${type} needs ${key}.${name}: the name of a thing in the picture (a kit names what it draws: regionsAt → {box, path, name})`);
    if (spec.name && v !== null && !(typeof v === 'string' && v.trim())) throw bad('the name of a thing in the picture');
    if (spec.oneOf && !spec.oneOf.includes(v)) throw bad(spec.oneOf.join(', '));
    if (spec.point && !(Array.isArray(v) && v.length === 2 && v.every(Number.isFinite))) throw bad('[x, y]');
    if (spec.color && !(v === null && spec.default === null) && !isColor(v)) throw bad('a hex colour such as "#000000"');
    if (spec.box && !isBox(v)) throw bad('a box [x0, y0, x1, y1] on the 1600×900 frame, with x0 < x1 and y0 < y1');
    if (spec.number && !(typeof v === 'number' && v >= spec.number[0] && v <= spec.number[1])) throw bad(`a number ${spec.number[0]}–${spec.number[1]}`);   // refusal: bad() says "must be" it
    out[name] = Array.isArray(v) ? Object.freeze([...v]) : v;
  }
  return Object.freeze(out);
}

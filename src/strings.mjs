/**
 * The string table: an on-screen word is written in the recipe as {"$string": "key"} and filled
 * from a per-language table ({key: text}), so one recipe draws every language. A key the table
 * does not have refuses the recipe, and so does a key when no table was given — a film never
 * shows a key name or a word from another language.
 */

/**
 * Fill every {"$string": key} in the recipe from `strings` (the `$` keeps it apart from data that
 * happens to have a key named "string", such as a code emphasis map). Returns the recipe itself when it
 * names no strings (nothing is copied), else a filled copy; the keys used are added to `used`.
 */
export function withStrings(recipe, strings, used = new Set()) {
  const walk = (value, where) => {
    if (Array.isArray(value)) return value.map((v, i) => walk(v, `${where}[${i}]`));
    if (!value || typeof value !== 'object') return value;
    const keys = Object.keys(value);
    // The key was {"string": key} before 2026-09-25; a recipe still written that way would draw
    // the object itself, so a table that has that key turns it into an error with the fix.
    if (keys.length === 1 && keys[0] === 'string' && strings && Object.hasOwn(strings, value.string)) throw new Error(`${where} is {"string": "${value.string}"}; string-table keys are written {"$string": "${value.string}"}`);
    if (keys.length === 1 && keys[0] === '$string') {
      const key = value.$string;
      if (!strings) throw new Error(`${where} names the string "${key}", and no string table was given`);
      if (!Object.hasOwn(strings, key) || typeof strings[key] !== 'string') throw new Error(`The string table has no "${key}" (${where})`);
      used.add(key);
      return strings[key];
    }
    return Object.fromEntries(keys.map(k => [k, walk(value[k], `${where}.${k}`)]));
  };
  const filled = walk(recipe, 'recipe');
  return used.size ? filled : recipe;
}

/**
 * Names a recipe writes are looked up only among a table's OWN keys, and records keyed by those names are built from
 * Maps and handed out with Object.fromEntries (which defines own properties, never the __proto__ setter). So a name
 * such as "constructor" never finds Object.prototype's, and none reaches it (read.mjs also refuses the three names
 * every object already has).
 */

/** The value a table holds under its own key `name`, or undefined (never one inherited from Object.prototype). */
export const own = (table, name) => (table && typeof name === 'string' && Object.hasOwn(table, name) ? table[name] : undefined);

/** A Map of Maps (or values) → plain objects, each key an own property. */
export const plain = map => Object.fromEntries([...map].map(([k, v]) => [k, v instanceof Map ? plain(v) : v]));

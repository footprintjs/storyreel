/**
 * The licence gate, one table and one verdict (LICENCES · licenceVerdict): CC0 and CC BY are used; CC BY-SA only when
 * the film opts in, because it puts the whole film under CC BY-SA (and never 1.0, which allows no later version for the
 * film); NC, ND and any licence the table does not know are refused, saying why and what to do instead.
 */
import {plainText} from './text.mjs';

/** By the source's licence code: `use` is 'yes', 'share-alike' (only with allowShareAlike) or 'no' (with why). */
export const LICENCES = Object.freeze({
  cc0: {name: 'CC0', use: 'yes'},
  by: {name: 'CC BY', use: 'yes'},
  'by-sa': {name: 'CC BY-SA', use: 'share-alike'},
  'by-nc': {name: 'CC BY-NC', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
  'by-nd': {name: 'CC BY-ND', use: 'no', why: 'ND allows no changes, and mixing a sound into a film changes it'},
  'by-nc-sa': {name: 'CC BY-NC-SA', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
  'by-nc-nd': {name: 'CC BY-NC-ND', use: 'no', why: 'NC allows no commercial use and ND no changes, and mixing a sound into a film changes it'},
  pdm: {name: 'Public Domain Mark', use: 'no', why: 'the Public Domain Mark labels a work as free where its maker lived, it grants nothing, and whether it is free depends on the country'},
  'sampling+': {name: 'Sampling+', use: 'no', why: 'Sampling+ allows parts of a work in a new one on conditions this gate does not read'},
  'nc-sampling+': {name: 'NC Sampling+', use: 'no', why: 'NC allows no commercial use, and a film is posted where ads run'},
});
const known = code => typeof code === 'string' && Object.hasOwn(LICENCES, code);
/** A licence version as the gate reads it ("4.0"), or null. */
export const licenceVersion = v => (typeof v === 'string' && /^\d{1,2}\.\d{1,2}$/.test(v) ? v : null);

/** The licence codes a search asks for: those the gate lets through, CC BY-SA too when the film opts in. */
export const usableLicences = ({allowShareAlike = false} = {}) => Object.keys(LICENCES).filter(k => LICENCES[k].use === 'yes' || (allowShareAlike && LICENCES[k].use === 'share-alike'));

/** A licence in words, "CC BY 4.0" (the code made plain when the table does not know it). */
export const licenceName = (code, version) => `${known(code) ? LICENCES[code].name : plainText(code, 20)}${licenceVersion(version) ? ` ${version}` : ''}`;

/** The licence's deed, built from its code and version (never a URL a source gave); null for a code the table does not know. */
export function licenceUrl(code, version) {
  if (!known(code)) return null;
  const v = licenceVersion(version) ?? (code === 'cc0' ? '1.0' : '4.0');
  return code === 'cc0' ? `https://creativecommons.org/publicdomain/zero/${v}/` : `https://creativecommons.org/licenses/${code}/${v}/`;
}

/**
 * The gate: {licence, name, shareAlike} for a licence a film may use, or a refusal that says why and what to do.
 * `who` names the sound ('the found sound "page-turn"'); `version` is its licence's version.
 */
export function licenceVerdict(licence, {allowShareAlike = false, who = 'this sound', version = null} = {}) {
  const instead = 'pick a CC0 or CC BY sound (npx storyreel sounds search "<words>")';
  if (!known(licence)) throw new Error(`${who} has the licence ${JSON.stringify(plainText(licence, 30))}, which StoryReel does not know: a film uses CC0 and CC BY sounds (CC BY-SA when it opts in) — ${instead}`);
  const entry = LICENCES[licence];
  if (entry.use === 'no') throw new Error(`${who} is ${entry.name}, which a film cannot use: ${entry.why} — ${instead}`);
  if (entry.use === 'share-alike' && !allowShareAlike) throw new Error(`${who} is ${entry.name}: using it puts the whole film under ${entry.name} too — to accept that, give the recipe "foundSounds": {"allowShareAlike": true} (and sounds add --allow-share-alike), or ${instead}`);
  if (entry.use === 'share-alike' && licenceVersion(version) === '1.0') throw new Error(`${who} is ${entry.name} 1.0, which lets a film that uses it be shared only under 1.0 itself, a licence nobody offers now — ${instead}`);
  return {licence, name: entry.name, shareAlike: entry.use === 'share-alike'};
}

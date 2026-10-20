/**
 * The Openverse adapter (https://api.openverse.org, the free media search of openly licensed works): a sound source in
 * StoryReel's own shape (sounds/index.mjs · checkSoundSource). It is the only module that talks to Openverse, and it is
 * loaded only on its own subpath (footprint-storyreel/sounds/openverse), so nothing that draws or renders a film imports it.
 *
 *   search(words, {licences, limit})  GET /v1/audio/?q=…&license=…  → candidates (compact, every text made plain)
 *   candidate(id)                     GET /v1/audio/<id>/            → one candidate
 *   fetch(candidate, {into})          the candidate's file, into `into` (sounds/download.mjs: https only, capped, timed)
 *
 * No key is needed (anonymous: 20 requests a minute, 200 a day). OPENVERSE_TOKEN from the environment, when set, goes
 * to Openverse's API only — never to the host a file comes from, never into a message or a record. The limits are read
 * from each answer's x-ratelimit-* headers (`limits`); a 429 stops with when to try again — StoryReel never retries on
 * its own. Search by words: Openverse's `category` is usually empty, so it is not asked.
 */
import path from 'node:path';
import {plainText} from '../found.mjs';
import {download, DOWNLOAD} from './download.mjs';

const API = 'https://api.openverse.org/v1/audio/';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The most of an answer read (a page of results is a few tens of KB). */
const MAX_ANSWER = 2 * 1024 * 1024;

/** The rate limits an answer reports: {burst?: {limit, available}, sustained?: {…}} from x-ratelimit-(limit|available)-<who>_<kind>. */
export function limitsOf(headers) {
  const out = {};
  for (const [key, value] of headers) {
    const m = /^x-ratelimit-(limit|available)-[\w.-]*?_?(burst|sustained)$/i.exec(key);
    if (m) (out[m[2].toLowerCase()] ??= {})[m[1].toLowerCase()] = plainText(value, 20);
  }
  return Object.keys(out).length ? out : null;
}
/** The limits in words: "19 of 20/min and 199 of 200/day left". */
export const limitsText = limits => (limits ? Object.values(limits).filter(l => l.limit).map(l => `${l.available ?? '?'} of ${l.limit}`).join(' and ') + ' left' : 'no limits reported');
/** When to try again, from Retry-After (seconds or a date), else from which limit ran out. */
function retryText(headers, limits) {
  const after = headers.get('retry-after');
  if (after && /^\d{1,6}$/.test(after)) return `in ${after} s`;
  if (after && Number.isFinite(Date.parse(after))) return `after ${new Date(Date.parse(after)).toISOString()}`;
  return limits?.sustained?.available === '0' ? 'tomorrow (the day\'s requests are used)' : 'in a minute';
}

/** A result as StoryReel's candidate: its id, words made plain, licence, seconds and where it comes from; null when it is not usable. */
function candidateOf(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !ID.test(r.id) || r.mature === true) return null;
  return Object.freeze({
    id: r.id, title: plainText(r.title, 120), creator: plainText(r.creator, 80), license: plainText(r.license, 20).toLowerCase(),
    licenseVersion: plainText(r.license_version, 8), seconds: Number.isFinite(r.duration) && r.duration > 0 ? r.duration / 1000 : null,
    source: plainText(r.source ?? r.provider, 40), attribution: plainText(r.attribution, 400),
    url: typeof r.url === 'string' ? r.url : null, landing: typeof r.foreign_landing_url === 'string' ? r.foreign_landing_url : null,
    bytes: Number.isInteger(r.filesize) && r.filesize > 0 ? r.filesize : null,
  });
}

/**
 * An Openverse sound source. `fetch` is the WHATWG fetch (a test hands in its own: tests never touch the network);
 * `token` defaults to OPENVERSE_TOKEN.
 */
export function openverse({token = process.env.OPENVERSE_TOKEN || null, fetch = globalThis.fetch, timeoutMs = 30000} = {}) {
  const headers = {accept: 'application/json', 'user-agent': 'footprint-storyreel', ...(token ? {authorization: `Bearer ${token}`} : {})};
  let limits = null;
  /** One API request: its JSON, or a refusal in words (never the request's headers: the token stays out of every message). */
  async function ask(url, what) {
    let res;
    try { res = await fetch(url, {headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs)}); } catch (e) {
      throw new Error(`Openverse did not answer the ${what} (${e?.name === 'TimeoutError' ? `nothing in ${timeoutMs / 1000} s` : plainText(e?.message ?? e, 100)}): try again later`, {cause: e});
    }
    limits = limitsOf(res.headers) ?? limits;
    if (res.status === 429) {
      await res.body?.cancel?.();
      throw Object.assign(new Error(`Openverse says too many requests (${limitsText(limits)}): try again ${retryText(res.headers, limits)} — StoryReel does not retry on its own`), {code: 'RATE_LIMITED'});
    }
    if (res.status === 404) { await res.body?.cancel?.(); throw new Error(`Openverse has no ${what}: check the id (npx storyreel sounds search "<words>" lists them)`); }
    if (!res.ok) { await res.body?.cancel?.(); throw new Error(`Openverse answered the ${what} with ${res.status}: try again later`); }
    const text = await res.text();
    if (text.length > MAX_ANSWER) throw new Error(`Openverse's answer to the ${what} is over ${MAX_ANSWER / 1024 / 1024} MB: try again with fewer results`);
    try { return JSON.parse(text); } catch (e) { throw new Error(`Openverse's answer to the ${what} is not JSON: try again later`, {cause: e}); }
  }
  return Object.freeze({
    name: 'openverse',
    /** The rate limits the last answer reported, in words ("19 of 20/min and 199 of 200/day left"), or null before any. */
    get limits() { return limits ? limitsText(limits) : null; },
    async search(words, {licences, limit = 5}) {
      const q = new URLSearchParams({q: words, license: licences.join(','), page_size: String(limit), mature: 'false'});
      const data = await ask(`${API}?${q}`, 'search');
      return (Array.isArray(data?.results) ? data.results : []).map(candidateOf).filter(Boolean).slice(0, limit);
    },
    async candidate(id) {
      if (typeof id !== 'string' || !ID.test(id)) throw new Error(`an Openverse id is like ec2e245c-465b-4ba7-9ea4-620f3555b291 (npx storyreel sounds search "<words>" lists them), not ${JSON.stringify(plainText(id, 60))}`);
      const c = candidateOf(await ask(`${API}${id}/`, `sound ${id}`));
      if (!c || c.id !== id) throw new Error(`Openverse's answer for ${id} is not that sound: try again later`);
      return c;
    },
    async fetch(candidate, {into, maxBytes = DOWNLOAD.maxBytes}) {
      if (!candidate?.url) throw new Error(`Openverse gives no file for ${candidate?.id ?? 'this sound'}: pick another sound`);
      const got = await download(candidate.url, path.join(into, 'download'), {fetch, maxBytes, timeoutMs});
      return {file: got.file, bytes: got.bytes, record: {...candidate, url: got.url}};
    },
  });
}

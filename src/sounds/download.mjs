/**
 * Downloading a found sound's file, the one way a source does it. The file's address came from a server's JSON, so it is
 * untrusted and may point at any host:
 *   - https only, every redirect too (at most DOWNLOAD.redirects of them, each checked again);
 *   - never an address on this machine or its network written as such: localhost (with or without its trailing dot), a
 *     loopback, private, link-local, site-local, carrier-grade or NAT64 IP literal, v4 or v6 (a name that resolves to
 *     one is not caught here: the https certificate is the guard);
 *   - at most `maxBytes`, refused from the Content-Length before reading and counted while reading;
 *   - within `timeoutMs` for the whole of it;
 *   - handed back as bytes, never written under a name the server gives: the source writes them into the folder it
 *     was given (files.mjs · writeOutput), and addSound names the kept file itself.
 * readCapped reads any answer the same way, counting as it reads (the API's JSON too).
 * No credentials go with it: the source's key, if any, is for the source's own API, never for the file's host.
 */
import {isIP} from 'node:net';
import {plainText, FOUND_LIMITS} from '../found/index.mjs';

export const DOWNLOAD = Object.freeze({maxBytes: FOUND_LIMITS.bytes, timeoutMs: 30000, redirects: 3});

/** Whether an IP literal is on this machine or a private network (v4, v6, and v4 mapped into v6). */
function localAddress(ip) {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);   // a v4 address mapped into v6, as URL writes it (::ffff:7f00:1)
  const v4 = isIP(ip) === 4 ? ip : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? (hex ? [hex[1], hex[2]].flatMap(h => { const n = parseInt(h, 16); return [n >> 8, n & 255]; }).join('.') : null);
  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  // Unspecified, loopback and every address under ::/96 (v4-compatible), NAT64 (64:ff9b::/96, a v4 address behind a
  // translator), unique-local, link-local, site-local and multicast.
  const v6 = ip.toLowerCase();
  return v6.startsWith('::') || v6.startsWith('64:ff9b:') || /^f[cd]/.test(v6) || /^fe[89a-f]/.test(v6) || /^ff/.test(v6);
}

/** A file address checked: an https URL to a public host. `what` names it in a refusal. */
export function checkFileUrl(href, what = 'the sound file') {
  let url;
  try { url = new URL(href); } catch { throw new Error(`${what}'s address is not a URL (${JSON.stringify(plainText(href, 80))}): pick another sound`); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();   // "localhost." is localhost
  if (url.protocol !== 'https:') throw new Error(`${what} is at ${url.protocol}// — StoryReel fetches only over https: pick another sound`);
  if (url.username || url.password) throw new Error(`${what}'s address carries a user name or password: StoryReel never sends one — pick another sound`);
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && localAddress(host))) throw new Error(`${what} is at ${host}, an address on this machine or its network: StoryReel fetches sounds only from public hosts — pick another sound`);
  return url;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/**
 * An answer's body, at most `maxBytes`: refused from its Content-Length before a byte is read, and counted while
 * reading (a server may not say, or may lie). `what` names it in a refusal ('the sound file').
 */
export async function readCapped(res, maxBytes, what) {
  const mb = (maxBytes / 1024 / 1024).toFixed(maxBytes < 1024 * 1024 ? 1 : 0), length = Number(res.headers.get('content-length'));
  const over = size => new Error(`${what} is ${size}, over the ${mb} MB it may be: ${what === 'the sound file' ? 'pick a shorter sound' : 'try again with fewer results'}`);
  if (Number.isFinite(length) && length > maxBytes) { await res.body?.cancel?.(); throw over(`${(length / 1024 / 1024).toFixed(1)} MB`); }   // refusal: over() names the fix
  const chunks = [];
  let bytes = 0;
  if (res.body) {
    for await (const chunk of res.body) {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) { await res.body.cancel?.().catch(() => {}); throw over(`more than ${mb} MB`); }   // refusal: over() names the fix
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)), bytes);
}

/**
 * Fetch `href`: {bytes, url (where it came from, after redirects)}. `fetch` is the WHATWG fetch (a test hands in its
 * own). Refuses, saying what happened and what to do.
 */
export async function download(href, {fetch = globalThis.fetch, maxBytes = DOWNLOAD.maxBytes, timeoutMs = DOWNLOAD.timeoutMs} = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let url = checkFileUrl(href);
  for (let hop = 0; ; hop++) {
    let res;
    try { res = await fetch(url.href, {redirect: 'manual', signal, headers: {accept: 'audio/*'}}); } catch (e) { throw failed(e, timeoutMs); }
    if (REDIRECT.has(res.status)) {
      await res.body?.cancel?.();
      if (hop >= DOWNLOAD.redirects) throw new Error(`the sound file redirects more than ${DOWNLOAD.redirects} times: pick another sound`);
      const next = res.headers.get('location');
      if (!next) throw new Error(`the sound file redirects (${res.status}) without saying where: pick another sound`);
      url = checkFileUrl(new URL(next, url).href, 'a redirect of the sound file');
      continue;
    }
    if (!res.ok) { await res.body?.cancel?.(); throw new Error(`the sound file's host answered ${res.status}: try again later, or pick another sound`); }
    let bytes;
    try { bytes = await readCapped(res, maxBytes, 'the sound file'); } catch (e) { throw e?.message?.startsWith('the sound file') ? e : failed(e, timeoutMs); }
    if (!bytes.length) throw new Error('the sound file came back empty: pick another sound');
    return {bytes, url: url.href};
  }
}

/** A failed request in words: no answer in time, or what the network said. */
const failed = (e, timeoutMs) => new Error(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `the sound file did not arrive within ${timeoutMs / 1000} s: try again later` : `the sound file could not be fetched (${plainText(e?.message ?? e, 120)}): try again later`, {cause: e});

/**
 * Downloading a found sound's file, the one way a source does it. The file's address came from a server's JSON, so it is
 * untrusted and may point at any host:
 *   - https only, every redirect too (at most DOWNLOAD.redirects of them, each checked again);
 *   - never an address on this machine or its network written as such: localhost, a loopback, private, link-local or
 *     carrier-grade IP literal (a name that resolves to one is not caught here: the https certificate is the guard);
 *   - at most `maxBytes`, refused from the Content-Length before reading and counted while reading;
 *   - within `timeoutMs` for the whole of it;
 *   - written to the file the caller names (in a folder of its own: sounds/index.mjs · addSound), created exclusively,
 *     never under a name the server gives.
 * No credentials go with it: the source's key, if any, is for the source's own API, never for the file's host.
 */
import {open} from 'node:fs/promises';
import {isIP} from 'node:net';
import {plainText, FOUND_LIMITS} from '../found.mjs';

export const DOWNLOAD = Object.freeze({maxBytes: FOUND_LIMITS.bytes, timeoutMs: 30000, redirects: 3});

/** Whether an IP literal is on this machine or a private network (v4, v6, and v4 mapped into v6). */
function localAddress(ip) {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);   // a v4 address mapped into v6, as URL writes it (::ffff:7f00:1)
  const v4 = isIP(ip) === 4 ? ip : /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? (hex ? [hex[1], hex[2]].flatMap(h => { const n = parseInt(h, 16); return [n >> 8, n & 255]; }).join('.') : null);
  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}

/** A file address checked: an https URL to a public host. `what` names it in a refusal. */
export function checkFileUrl(href, what = 'the sound file') {
  let url;
  try { url = new URL(href); } catch { throw new Error(`${what}'s address is not a URL (${JSON.stringify(plainText(href, 80))}): pick another sound`); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (url.protocol !== 'https:') throw new Error(`${what} is at ${url.protocol}// — StoryReel fetches only over https: pick another sound`);
  if (url.username || url.password) throw new Error(`${what}'s address carries a user name or password: StoryReel never sends one — pick another sound`);
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) && localAddress(host))) throw new Error(`${what} is at ${host}, an address on this machine or its network: StoryReel fetches sounds only from public hosts — pick another sound`);
  return url;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch `href` into `file`: {file, bytes, url (where it came from, after redirects)}. `fetch` is the WHATWG fetch (a
 * test hands in its own). Refuses, saying what happened and what to do; the caller removes a partial file.
 */
export async function download(href, file, {fetch = globalThis.fetch, maxBytes = DOWNLOAD.maxBytes, timeoutMs = DOWNLOAD.timeoutMs} = {}) {
  const signal = AbortSignal.timeout(timeoutMs), mb = (maxBytes / 1024 / 1024).toFixed(0);
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
    const length = Number(res.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) { await res.body?.cancel?.(); throw new Error(`the sound file is ${(length / 1024 / 1024).toFixed(1)} MB, over the ${mb} MB a found sound may be: pick a shorter sound`); }
    if (!res.body) throw new Error('the sound file came back empty: pick another sound');
    const handle = await open(file, 'wx', 0o600);
    let bytes = 0;
    try {
      for await (const chunk of res.body) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw new Error(`the sound file is over the ${mb} MB a found sound may be: pick a shorter sound`);
        await handle.write(chunk);
      }
    } catch (e) { throw e?.message?.startsWith('the sound file') ? e : failed(e, timeoutMs); } finally { await handle.close(); }
    if (!bytes) throw new Error('the sound file came back empty: pick another sound');
    return {file, bytes, url: url.href};
  }
}

/** A failed request in words: no answer in time, or what the network said. */
const failed = (e, timeoutMs) => new Error(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? `the sound file did not arrive within ${timeoutMs / 1000} s: try again later` : `the sound file could not be fetched (${plainText(e?.message ?? e, 120)}): try again later`, {cause: e});

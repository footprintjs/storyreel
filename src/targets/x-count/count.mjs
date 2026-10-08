/**
 * A post's length as X counts it: twitter-text 3.1.0's weighted length (`parseTweet(text).weightedLength`, config
 * v3), ported. twitter-text is the library X publishes for counting a post; test/fixtures/x-counts.json pins this
 * port to it, row by row (scripts/x-counts.mjs makes the table from a scratch install of twitter-text@3.1.0).
 *
 * The count: the text composed first (NFC); a link 23, however long (X shortens it with t.co); an emoji 2, however
 * many code points it takes (emoji.mjs); every other code point 1 in a light range (U+0000–U+10FF: Latin, Greek,
 * Cyrillic, Hebrew, Arabic, the Indic scripts, Thai…; and U+2000–U+200D, U+2010–U+201F, U+2032–U+2037: spaces,
 * dashes, quotes, primes), else 2 (Chinese, Japanese, Korean, the ellipsis…).
 *
 * Copyright 2018 Twitter, Inc. Licensed under the Apache License, Version 2.0 (LICENSE-twitter-text, beside this file).
 * Modified from twitter-text 3.1.0 (npm, dist/): parseTweet.js, configs.js (version3), lib/getCharacterWeight.js,
 * extractUrlsWithIndices.js, lib/idna.js and the regexp/ files its URL expression is made of, gathered into one
 * module: only the weighted length is kept (no validity, no display range), the expressions are composed with
 * template strings instead of regexSupplant, and punycode's toASCII is replaced by the length of RFC 3492's
 * encoding, the one thing idna asks of it.
 */
import {GTLDS, CCTLDS} from './tlds.mjs';
import {EMOJI} from './emoji.mjs';

// configs.js · version3, its scale (100) divided out: a link 23, an emoji the default weight, a code unit in a light
// range 1, any other the default weight (getCharacterWeight).
const LINK = 23, WEIGHT = 2, LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const weight = unit => (LIGHT.some(([a, b]) => unit >= a && unit <= b) ? 1 : WEIGHT);

// The URL expression as regexp/*.js compose it, each piece named after its file. No u flag: like twitter-text it reads
// UTF-16 code units (half of an emoji is a domain character).
const SPACES = String.raw`\x09-\x0D\x20\x85\xA0\u1680\u180E\u2000-\u200A\u2028\u2029\u202F\u205F\u3000`;   // spacesGroup
const INVALID = String.raw`\uFFFE\uFEFF\uFFFF`;   // invalidCharsGroup
const DIRECTIONAL = String.raw`\u202A-\u202E\u061C\u200E\u200F\u2066\u2067\u2068\u2069`;   // directionalMarkersGroup
const PUNCT = String.raw`\!'#%&'\(\)*\+,\\\-\.\/:;<=>\?@\[\]\^_{|}~\$`;   // punct: " and ` are not in it, so they are domain characters
const LATIN = String.raw`\xC0-\xD6\xD8-\xF6\xF8-\xFF\u0100-\u024F\u0253\u0254\u0256\u0257\u0259\u025B\u0263\u0268\u026F\u0272\u0289\u028B\u02BB\u0300-\u036F\u1E00-\u1EFF`;   // latinAccentChars
const CYRILLIC = String.raw`\u0400-\u04FF`;   // cyrillicLettersAndMarks
// validDomainChars (twitter-text's text of invalidDomainChars also holds a few '/', already excluded by punct)
const DOMAIN_CHAR = `[^${PUNCT}${SPACES}${INVALID}${DIRECTIONAL}]`;
const tld = names => `(?:(?:${names.join('|')})(?=[^0-9a-zA-Z@+-]|$))`;   // validGTLD, validCCTLD: a whole name, not the start of a longer word
const TLD = `(?:${tld(GTLDS)}|${tld(CCTLDS)}|(?:xn--[\\-0-9a-z]+))`;   // … or validPunycode
const SUBDOMAIN = String.raw`(?:(?:${DOMAIN_CHAR}(?:[_-]|${DOMAIN_CHAR})*)?${DOMAIN_CHAR}\.)`;   // validSubdomain
const DOMAIN_NAME = String.raw`(?:(?:${DOMAIN_CHAR}(?:-|${DOMAIN_CHAR})*)?${DOMAIN_CHAR}\.)`;   // validDomainName
const DOMAIN = `(?:${SUBDOMAIN}*${DOMAIN_NAME}${TLD})`;   // validDomain
const PATH_CHAR = String.raw`[a-z${CYRILLIC}0-9!\*';:=\+,\.\$\/%#\[\]\-\u2013_~@\|&${LATIN}]`;   // validGeneralUrlPathChars
const PARENS = String.raw`\((?:${PATH_CHAR}+|(?:${PATH_CHAR}*\(${PATH_CHAR}+\)${PATH_CHAR}*))\)`;   // validUrlBalancedParens: one level nested
const PATH_END = String.raw`[\+\-a-z${CYRILLIC}0-9=_#\/${LATIN}]|(?:${PARENS})`;   // validUrlPathEndingChars
// validUrlPath. PATH_END goes in unbracketed, as regexSupplant puts it, so its | splits the group: a piece of path is
// path characters up to an ending character, or one pair of brackets alone, or @name/.
const PATH = String.raw`(?:(?:${PATH_CHAR}*(?:${PARENS}${PATH_CHAR}*)*${PATH_END})|(?:@${PATH_CHAR}+\/))`;
const QUERY = String.raw`[a-z0-9!?\*'@\(\);:&=\+\$\/%#\[\]\-_\.,~|]*[a-z0-9\-_&=#\/]`;   // validUrlQueryChars, validUrlQueryEndingChars
// validUrlPrecedingChars: a link starts the text, or follows a directional mark, or anything but a letter, a digit,
// @ ＠ $ # ＃ (a mention, a cashtag, a hashtag) or an invalid character.
const BEFORE = `(?:[^A-Za-z0-9@＠$#＃${INVALID}]|[${DIRECTIONAL}]|^)`;
// extractUrl: 2 the character before, 3 the link, 4 its protocol, 5 its domain, 6 the port, 7 the path, 8 the query.
const URL = new RegExp(String.raw`((${BEFORE})((https?:\/\/)?(${DOMAIN})(?::([0-9]+))?(\/${PATH}*)?(\?${QUERY})?))`, 'gi');
const ASCII_DOMAIN = new RegExp(String.raw`(?:(?:[\-a-z0-9${LATIN}]+)\.)+${TLD}`, 'gi');   // validAsciiDomain
const TCO = new RegExp(String.raw`^https?:\/\/t\.co\/([a-z0-9]+)(?:\?${QUERY})?`, 'i');   // validTcoUrl
const BARE_AFTER = /[-_.\/]$/;   // invalidUrlWithoutProtocolPrecedingChars

/**
 * The links in a text, as extractUrlsWithIndices finds them with its default, extractUrlsWithoutProtocol: each
 * {start, url}, url being the text parseTweet skips (its length, not the span, is what it skips).
 */
function links(text) {
  if (!text.includes('.')) return [];   // a link has a dot
  const found = [];
  for (const m of text.matchAll(URL)) {
    const [, , before, url, protocol, domain, , path] = m, start = m.index + m[0].length - url.length;
    if (!validUrl(url, protocol || 'https://', domain)) continue;
    if (protocol) {
      const tco = url.match(TCO);   // a t.co link is its slug (and query) only, and no link at all past 40 characters
      if (tco && tco[1].length > 40) continue;
      found.push({start, url: tco ? tco[0] : url});
      continue;
    }
    if (BARE_AFTER.test(before)) continue;   // a bare name after - _ . or / is part of something else (a path, a file)
    let last = null, end = 0;
    for (const [ascii] of domain.matchAll(ASCII_DOMAIN)) {   // a bare domain links only its ASCII names, each one
      const at = domain.indexOf(ascii, end); end = at + ascii.length;
      found.push(last = {start: start + at, url: ascii});
    }
    if (last && path) last.url = url.replace(domain, last.url);   // the last name takes the port, path and query
  }
  return found;
}

/**
 * isValidUrl: the domain passes idna and the link, its protocol (else https://) included, is at most 4,096 long
 * (idna hands back the domain as it came, so the length is the link's own).
 */
const validUrl = (url, protocol, domain) => toAscii(domain) && protocol.length + url.length <= 4096;

/** lib/idna.js · toAscii, as a yes or no: a domain starting xn-- holds an ASCII domain, and each label is 1–63 long in punycode. */
function toAscii(domain) {
  if (domain.startsWith('xn--') && domain.search(ASCII_DOMAIN) < 0) return false;
  return domain.split('.').every(label => { const n = punycodeLength(label); return n >= 1 && n <= 63; });
}

/**
 * The length of punycode's toASCII(label) as idna gets it under Node — the built-in punycode 2.1, which a bare
 * require('punycode') loads ahead of twitter-text's punycode 1.4.1 dependency (the two differ only on a label holding
 * a control character, which 1.4.1 encodes too). The label splits again at the ideographic and fullwidth full stops,
 * and a part holding anything beyond ASCII becomes xn-- and its encoding (a label never holds the @ toASCII would also
 * split at: @ is no domain character). The answer is never shorter than the label's code points, so past 63 of them
 * it is "too long" without encoding — and the encoder only ever meets labels far from overflowing.
 */
function punycodeLength(label) {
  if ([...label].length > 63) return 64;
  return label.split(/[\u3002\uFF0E\uFF61]/).reduce((n, part, i) => n + (i && 1) + (/[^\x00-\x7F]/.test(part) ? 4 + encodedLength(part) : part.length), 0);
}

/** RFC 3492's encoder (§6.3) as punycode runs it, counting the characters it writes instead of writing them. */
function encodedLength(part) {
  const points = Array.from(part, c => c.codePointAt(0)), basic = points.filter(p => p < 0x80).length;
  let n = 0x80, delta = 0, bias = 72, h = basic, written = basic + (basic ? 1 : 0);   // the basic code points, then "-"
  while (h < points.length) {
    const m = Math.min(...points.filter(p => p >= n));
    delta += (m - n) * (h + 1); n = m;
    for (const p of points) {
      if (p < n) delta++;
      if (p !== n) continue;
      let q = delta;
      for (let k = 36; ; k += 36) {   // a variable-length number: a digit per threshold it passes, then the last
        const t = k <= bias ? 1 : k >= bias + 26 ? 26 : k - bias;
        if (q < t) break;
        written++; q = Math.floor((q - t) / (36 - t));
      }
      written++; bias = adapt(delta, h + 1, h === basic); delta = 0; h++;
    }
    delta++; n++;
  }
  return written;
}
function adapt(delta, points, first) {   // RFC 3492 §6.1: base 36, t 1–26, skew 38, damp 700
  delta = first ? Math.floor(delta / 700) : delta >> 1;
  delta += Math.floor(delta / points);
  let k = 0;
  for (; delta > 455; k += 36) delta = Math.floor(delta / 35);
  return Math.floor(k + 36 * delta / (delta + 38));
}

/** The emoji in a text, as twemoji-parser 11.0.2's parse finds them: [start, length]. */
const emoji = text => Array.from(text.matchAll(EMOJI), m => [m.index, m[0].length]);

const pairAt = (t, i) => i < t.length - 1 && t.charCodeAt(i) >= 0xD800 && t.charCodeAt(i) <= 0xDBFF && t.charCodeAt(i + 1) >= 0xDC00 && t.charCodeAt(i + 1) <= 0xDFFF;

/** A text's weighted length: parseTweet(text).weightedLength under config v3. */
export function weightedLength(text) {
  const t = text.normalize(), link = new Map(links(t).map(l => [l.start, l.url.length])), pict = new Map(emoji(t));
  let n = 0;
  for (let i = 0; i < t.length; i++) {   // by UTF-16 unit, as parseTweet walks: a link or an emoji starting here, else one code point
    if (link.has(i)) { n += LINK; i += link.get(i) - 1; }
    else if (pict.has(i)) { n += WEIGHT; i += pict.get(i) - 1; }
    else { if (pairAt(t, i)) i++; n += weight(t.charCodeAt(i)); }   // a pair is weighed by its second half: never light, 2
  }
  return n;
}

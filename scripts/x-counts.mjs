#!/usr/bin/env node
/**
 * Makes test/fixtures/x-counts.json: each text below with the length X's published counting library gives it —
 * twitter-text 3.1.0's parseTweet(text).weightedLength (config v3, emoji from twemoji-parser 11.0.2). The release
 * test checks xLength (src/targets/x.mjs, a port of that count) against every row.
 *
 * twitter-text is not a dependency of StoryReel and never becomes one: install it in a scratch folder, and name that.
 *
 *   mkdir -p /tmp/x-counts && cd /tmp/x-counts && npm init -y && npm install twitter-text@3.1.0
 *   node scripts/x-counts.mjs /tmp/x-counts
 *
 * Run under Node, as the table was: there twitter-text's idna gets Node's own punycode (a bare require('punycode')).
 * It refuses another version of either library, and a vendored copy (src/targets/x-count/tlds.mjs, emoji.mjs) that
 * differs from the installed one. A text is written once, in the first group that names it.
 */
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {GTLDS, CCTLDS} from '../src/targets/x-count/tlds.mjs';
import {EMOJI} from '../src/targets/x-count/emoji.mjs';

const refuse = message => { console.error(`x-counts: ${message}`); process.exit(1); };
const dir = process.argv[2];
if (!dir) refuse('name the folder twitter-text@3.1.0 is installed in: node scripts/x-counts.mjs <folder>');
process.noDeprecation = true;   // twitter-text's idna requires Node's punycode module, which Node marks deprecated
const need = createRequire(path.resolve(dir, 'package.json')), twemoji = createRequire(need.resolve('twitter-text'));
const versions = {'twitter-text': need('twitter-text/package.json').version, 'twemoji-parser': twemoji('twemoji-parser/package.json').version};
if (versions['twitter-text'] !== '3.1.0' || versions['twemoji-parser'] !== '11.0.2') refuse(`want twitter-text 3.1.0 with twemoji-parser 11.0.2, found ${JSON.stringify(versions)}`);

// The vendored copies are the installed ones, exactly.
const names = file => { const s = need(`twitter-text/dist/regexp/${file}`).source, a = '(?:(?:', b = ')(?=[^0-9a-zA-Z@+-]|$))'; return s.startsWith(a) && s.endsWith(b) ? s.slice(a.length, -b.length).split('|') : []; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
if (!same(names('validGTLD.js'), GTLDS) || !same(names('validCCTLD.js'), CCTLDS)) refuse('src/targets/x-count/tlds.mjs is not twitter-text 3.1.0\'s validGTLD and validCCTLD');
const theirs = twemoji('twemoji-parser/dist/lib/regex.js').default;
if (theirs.source !== EMOJI.source || theirs.flags !== EMOJI.flags) refuse('src/targets/x-count/emoji.mjs is not twemoji-parser 11.0.2\'s dist/lib/regex.js');

const tt = need('twitter-text'), parseTweet = (tt.default ?? tt).parseTweet;
const a = n => 'a'.repeat(n), u = n => '\u{FC}'.repeat(n);   // ü

const cases = [
  // Links: 23 each, however long; the limits of a link (4,096 with its protocol; a label of 63 in punycode).
  ['links', 'see https://example.com/a/very/long/path?q=1'],
  ['links', 'http://example.com'],
  ['links', 'https://www.example.com/path/to/page.html'],
  ['links', 'go to https://example.com/a and https://example.org/b'],
  ['links', 'https://a.b.c.d.example.com'],
  ['links', 'https://example.com/path\nhttps://example.org'],
  ['links', 'https://example.com\u{3000}next'],
  ['links', `https://example.com/${a(4068)}`],
  ['links', `https://example.com/${a(4069)}`],
  ['links', `https://${a(63)}.com`],
  ['links', `https://${a(64)}.com`],
  ['links', `https://${u(57)}.de`],
  ['links', `https://${u(58)}.de`],
  ['links', 'https://\u{1F600}.com'],
  // What ends a link: punctuation after it is text.
  ['trailing punctuation', 'see https://example.com.'],
  ['trailing punctuation', 'Watch the whole film at https://storyreel.dev/ep1.'],
  ['trailing punctuation', 'New episode: https://storyreel.dev/ep2!!'],
  ['trailing punctuation', 'https://example.com/path.'],
  ['trailing punctuation', 'https://example.com/path,'],
  ['trailing punctuation', 'https://example.com/path;'],
  ['trailing punctuation', 'https://example.com/path:'],
  ['trailing punctuation', 'https://example.com/path!'],
  ['trailing punctuation', 'https://example.com/path?'],
  ['trailing punctuation', 'https://example.com/path?!'],
  ['trailing punctuation', 'https://example.com/path\u{2026}'],
  ['trailing punctuation', '"https://example.com/path"'],
  ['trailing punctuation', "'https://example.com/path'"],
  ['trailing punctuation', '\u{201C}https://example.com/path\u{201D}'],
  ['trailing punctuation', 'https://example.com/path)'],
  ['trailing punctuation', '[https://example.com/path]'],
  ['trailing punctuation', 'https://example.com/path]'],
  ['trailing punctuation', 'https://example.com/path\u{2014}next'],
  ['trailing punctuation', 'https://example.com/path/'],
  ['trailing punctuation', 'https://example.com/path#'],
  ['trailing punctuation', 'https://example.com/path#section.'],
  ['trailing punctuation', 'https://example.com/path-'],
  ['trailing punctuation', 'https://example.com/path_'],
  ['trailing punctuation', 'https://example.com/path~'],
  ['trailing punctuation', 'https://example.com/path*'],
  ["trailing punctuation", "https://example.com/path'"],
  ['trailing punctuation', 'https://example.com/path|'],
  ['trailing punctuation', 'https://example.com/path@'],
  ['trailing punctuation', 'https://example.com/path&'],
  ['trailing punctuation', 'https://example.com/path='],
  ['trailing punctuation', 'https://example.com/path+'],
  ['trailing punctuation', 'https://example.com/path%'],
  ['trailing punctuation', 'https://example.com/path$'],
  ['trailing punctuation', 'https://example.com/path<b>'],
  ['trailing punctuation', 'example.com.'],
  ['trailing punctuation', 'example.com!'],
  ['trailing punctuation', 'example.com/path.'],
  // Ports, IP addresses, localhost: a name without a known top-level domain is no link.
  ['ports, IPs, localhost', 'https://example.com:8080/path'],
  ['ports, IPs, localhost', 'example.com:8080/path'],
  ['ports, IPs, localhost', 'example.com:8080'],
  ['ports, IPs, localhost', 'https://example.com:443'],
  ['ports, IPs, localhost', 'https://example.com:99999/x'],
  ['ports, IPs, localhost', 'http://localhost:3000'],
  ['ports, IPs, localhost', 'localhost:3000'],
  ['ports, IPs, localhost', 'http://localhost/'],
  ['ports, IPs, localhost', 'http://127.0.0.1:8080/'],
  ['ports, IPs, localhost', '192.168.0.1'],
  ['ports, IPs, localhost', 'http://[::1]:3000/'],
  // Emails, mentions, hashtags, cashtags: a domain after @ # $ (or - _ . /) is part of them.
  ['emails, mentions, hashtags, cashtags', 'sanjay@example.com'],
  ['emails, mentions, hashtags, cashtags', 'first.last@example.co.uk'],
  ['emails, mentions, hashtags, cashtags', 'contact: hello@storyreel.dev.'],
  ['emails, mentions, hashtags, cashtags', 'mailto:someone@example.com'],
  ['emails, mentions, hashtags, cashtags', '@storyreel'],
  ['emails, mentions, hashtags, cashtags', '@x.com'],
  ['emails, mentions, hashtags, cashtags', 'cc @user, see x.com'],
  ['emails, mentions, hashtags, cashtags', '#storyreel #kidsmaths'],
  ['emails, mentions, hashtags, cashtags', '#x.com'],
  ['emails, mentions, hashtags, cashtags', '$x.com'],
  ['emails, mentions, hashtags, cashtags', '$TSLA is up'],
  ['emails, mentions, hashtags, cashtags', '-x.com'],
  ['emails, mentions, hashtags, cashtags', '_x.com'],
  ['emails, mentions, hashtags, cashtags', '\u{FF20}example.com'],
  ['emails, mentions, hashtags, cashtags', '\u{FF03}example.com'],
  ['emails, mentions, hashtags, cashtags', '@https://example.com'],
  ['emails, mentions, hashtags, cashtags', '#https://example.com'],
  ['emails, mentions, hashtags, cashtags', '$https://example.com'],
  ['emails, mentions, hashtags, cashtags', 'abchttps://example.com'],
  ['emails, mentions, hashtags, cashtags', '_https://example.com'],
  ['emails, mentions, hashtags, cashtags', '.https://example.com'],
  // Dotted words: a link only when the last part is a top-level domain X knows (md is Moldova's, sh Saint Helena's).
  ['dotted words', 'Node.js'],
  ['dotted words', 'footprint.mjs'],
  ['dotted words', 'index.html'],
  ['dotted words', 'package.json'],
  ['dotted words', 'v0.4.0'],
  ['dotted words', 'St.Louis'],
  ['dotted words', 'README.md'],
  ['dotted words', 'notes.md'],
  ['dotted words', 'run.sh'],
  ['dotted words', 'main.go'],
  ['dotted words', 'app.ts'],
  ['dotted words', 'script.py'],
  ['dotted words', 'style.css'],
  ['dotted words', 'photo.png'],
  ['dotted words', 'image.jpg'],
  ['dotted words', 'data.csv'],
  ['dotted words', 'config.yaml'],
  ['dotted words', 'file.txt'],
  ['dotted words', 'archive.tar.gz'],
  ['dotted words', 'program.exe'],
  ['dotted words', 'i.e. this'],
  ['dotted words', 'version 0.10.0'],
  ['dotted words', 'v1.2.3-beta.4'],
  ['dotted words', 'Mr.Smith'],
  ['dotted words', 'U.S.A.'],
  ['dotted words', 'a.m.'],
  ['dotted words', '3.14'],
  ['dotted words', 'Wait...what'],
  ['dotted words', 'Runs on Node.js; open index.html to see it.'],
  ['dotted words', 'How footprint.js explains a run'],
  // Links beside Chinese, Japanese, Korean and Arabic.
  ['beside CJK and Arabic', 'https://example.com\u{8BE6}\u{60C5}'],
  ['beside CJK and Arabic', '\u{770B}\u{8FD9}\u{91CC}https://example.com/path'],
  ['beside CJK and Arabic', '\u{8ACB}\u{770B}example.com/path\u{8B1D}\u{8B1D}'],
  ['beside CJK and Arabic', 'https://example.com/\u{65E5}\u{672C}'],
  ['beside CJK and Arabic', 'https://example.com/\u{645}\u{631}\u{62D}\u{628}\u{627}'],
  ['beside CJK and Arabic', '\u{632}\u{648}\u{631}\u{648}\u{627} https://example.com \u{627}\u{644}\u{64A}\u{648}\u{645}'],
  ['beside CJK and Arabic', '\u{632}\u{648}\u{631}\u{648}\u{627} example.com \u{627}\u{644}\u{64A}\u{648}\u{645}'],
  ['beside CJK and Arabic', '\u{645}\u{631}\u{62D}\u{628}\u{627}https://example.com'],
  ['beside CJK and Arabic', 'example.com\u{645}\u{631}\u{62D}\u{628}\u{627}'],
  ['beside CJK and Arabic', '\u{D55C}\u{AD6D}\u{C5B4}https://example.com'],
  ['beside CJK and Arabic', 'https://example.com\u{D55C}\u{AD6D}\u{C5B4}'],
  // Brackets in a path: balanced, one level nested.
  ['brackets in paths', 'https://en.wikipedia.org/wiki/Foo_(bar))'],
  ['brackets in paths', '(see https://en.wikipedia.org/wiki/Foo_(bar))'],
  ['brackets in paths', 'https://example.com/a(b(c)d)e'],
  ['brackets in paths', 'https://example.com/a((b))'],
  ['brackets in paths', 'https://example.com/(x)'],
  ['brackets in paths', 'https://example.com/a(b'],
  ['brackets in paths', 'https://example.com/@user/'],
  ['brackets in paths', 'https://medium.com/@user/post-title'],
  ['brackets in paths', 'https://example.com/\u{2013}dash'],
  ['brackets in paths', 'https://ru.wikipedia.org/wiki/\u{41C}\u{43E}\u{441}\u{43A}\u{432}\u{430}'],
  ['brackets in paths', 'https://example.com/caf\u{E9}'],
  // Query strings: what may end one.
  ['queries', 'https://example.com/?q=1'],
  ['queries', 'https://example.com?q=1'],
  ['queries', 'https://example.com/search?q=a+b&lang=en'],
  ['queries', 'https://example.com/search?q=1.'],
  ['queries', 'https://example.com/search?q=1!'],
  ['queries', 'https://example.com/search?q=(1)'],
  ['queries', 'https://example.com/path?q=1#frag'],
  ['queries', 'example.com?q=1'],
  ['queries', 'example.com/search?q=1'],
  // t.co: the slug (and query) only, and no link past 40.
  ['t.co', 'https://t.co/abc123XYZ'],
  ['t.co', 'https://t.co/abc?amp=1'],
  ['t.co', 'https://t.co/abc/def'],
  ['t.co', `https://t.co/${a(40)}`],
  ['t.co', `https://t.co/${a(41)}`],
  ['t.co', 't.co/abc'],
  ['t.co', 'http://t.co/abc.'],
  // Bare domains, short country ones among them.
  ['bare domains', 'x.co'],
  ['bare domains', 'bit.ly'],
  ['bare domains', 'example.co.uk'],
  ['bare domains', 'example.co.uk/path'],
  ['bare domains', 'sub.example.co.uk'],
  ['bare domains', 'go to bit.ly/abc'],
  ['bare domains', 'x.co/abc'],
  ['bare domains', 'a.b'],
  ['bare domains', 'abc.de'],
  ['bare domains', 'example.museum'],
  ['bare domains', 'example.onion'],
  ['bare domains', 'example.zip'],
  ['bare domains', 'example.mov'],
  // Case, punycode, composed and decomposed letters (X counts the composed form, NFC).
  ['case, punycode, NFC', 'EXAMPLE.COM'],
  ['case, punycode, NFC', 'Example.Com/Path'],
  ['case, punycode, NFC', 'https://Example.COM/A'],
  ['case, punycode, NFC', 'xn--80ak6aa92e.com'],
  ['case, punycode, NFC', 'https://xn--80ak6aa92e.com'],
  ['case, punycode, NFC', 'xn--abc'],
  ['case, punycode, NFC', 'https://m\u{FC}nchen.de'],
  ['case, punycode, NFC', 'm\u{FC}nchen.de'],
  ['case, punycode, NFC', 'https://\u{43F}\u{440}\u{438}\u{43C}\u{435}\u{440}.\u{440}\u{444}'],
  ['case, punycode, NFC', '\u{43F}\u{440}\u{438}\u{43C}\u{435}\u{440}.\u{440}\u{444}'],
  ['case, punycode, NFC', 'https://\u{4F8B}\u{5B50}.\u{4E2D}\u{56FD}'],
  ['case, punycode, NFC', 'caf\u{E9}'],
  ['case, punycode, NFC', 'cafe\u{301}'],
  ['case, punycode, NFC', 'n\u{303}'],
  ['case, punycode, NFC', 'A\u{30A}'],
  ['case, punycode, NFC', '\u{1100}\u{1161}'],
  ['case, punycode, NFC', '\u{212B}'],
  ['case, punycode, NFC', '\u{2126}'],
  ['case, punycode, NFC', '\u{FB01}'],
  // Emoji: 2 each when twemoji-parser 11.0.2 knows the whole sequence.
  ['emoji', '*\u{FE0F}\u{20E3}'],
  ['emoji', '1\u{20E3}'],
  ['emoji', '0\u{FE0F}\u{20E3}1\u{FE0F}\u{20E3}2\u{FE0F}\u{20E3}'],
  ['emoji', '\u{1F1FA}\u{1F1F8}\u{1F1EC}\u{1F1E7}'],
  ['emoji', '\u{1F1FA}\u{1F1F3}'],
  ['emoji', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'],
  ['emoji', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}'],
  ['emoji', '\u{1F3F4}\u{E0075}\u{E0073}\u{E0074}\u{E0078}\u{E007F}'],
  ['emoji', '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}'],
  ['emoji', '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}'],
  ['emoji', '\u{1F469}\u{200D}\u{1F469}\u{200D}\u{1F466}'],
  ['emoji', '\u{1F468}\u{200D}\u{1F468}\u{200D}\u{1F467}\u{200D}\u{1F467}'],
  ['emoji', '\u{1F44D}\u{1F3FF}'],
  ['emoji', '\u{1F469}\u{1F3FD}\u{200D}\u{1F4BB}'],
  ['emoji', '\u{1F468}\u{1F3FD}\u{200D}\u{1F9B0}'],
  ['emoji', '\u{26F9}\u{1F3FD}\u{200D}\u{2640}\u{FE0F}'],
  ['emoji', '\u{1F937}\u{1F3FD}\u{200D}\u{2642}\u{FE0F}'],
  ['emoji', '\u{1F9B8}\u{200D}\u{2640}\u{FE0F}'],
  ['emoji', '\u{1F3C3}\u{200D}\u{2642}\u{FE0F}'],
  ['emoji', '\u{1F3CC}\u{FE0F}\u{200D}\u{2640}\u{FE0F}'],
  ['emoji', '\u{1F575}\u{FE0F}\u{200D}\u{2640}\u{FE0F}'],
  ['emoji', '\u{1F46F}\u{200D}\u{2642}\u{FE0F}'],
  ['emoji', '\u{1F9DC}\u{200D}\u{2640}\u{FE0F}'],
  ['emoji', '\u{1F441}\u{200D}\u{1F5E8}'],
  ['emoji', '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}'],
  ['emoji', '\u{AE}\u{FE0F}'],
  ['emoji', '\u{2122}\u{FE0F}'],
  ['emoji', '\u{203C}'],
  ['emoji', '\u{203C}\u{FE0F}'],
  ['emoji', '\u{2049}'],
  ['emoji', '\u{2049}\u{FE0F}'],
  ['emoji', '\u{265F}'],
  ['emoji', '\u{265F}\u{FE0F}'],
  ['emoji', '\u{2764}\u{FE0E}'],
  ['emoji', '\u{263A}'],
  ['emoji', '\u{263A}\u{FE0F}'],
  ['emoji', '\u{263A}\u{FE0E}'],
  ['emoji', '\u{FE0F}'],
  ['emoji', '\u{200D}'],
  ['emoji', 'a\u{200D}b'],
  ['emoji', 'I \u{1F9E1} Twemoji! \u{1F973}'],
  ['emoji', 'Ep 1 \u{2014} pebbles and sheep \u{1F411}\u{1FAA8}'],
  // Emoji newer than twemoji-parser 11.0.2 (Emoji 11.0): counted as their parts, never less than 2.
  ['newer emoji', '\u{2764}\u{FE0F}\u{200D}\u{1F525}'],
  ['newer emoji', '\u{2764}\u{FE0F}\u{200D}\u{1FA79}'],
  ['newer emoji', '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}\u{FE0F}'],
  ['newer emoji', '\u{1F9D1}\u{200D}\u{1F9D1}\u{200D}\u{1F9D2}'],
  ['newer emoji', '\u{1F9D1}\u{1F3FD}\u{200D}\u{1F4BB}'],
  ['newer emoji', '\u{1FAF1}\u{1F3FD}\u{200D}\u{1FAF2}\u{1F3FF}'],
  ['newer emoji', '\u{1F642}\u{200D}\u{2194}\u{FE0F}'],
  ['newer emoji', '\u{1F9D4}\u{200D}\u{2640}\u{FE0F}'],
  ['newer emoji', '\u{1F9D1}\u{200D}\u{1F384}'],
  ['newer emoji', '\u{1F43B}\u{200D}\u{2744}\u{FE0F}'],
  ['newer emoji', '\u{1F636}\u{200D}\u{1F32B}\u{FE0F}'],
  ['newer emoji', '\u{1FAE0}'],
  ['newer emoji', '\u{1F979}'],
  ['newer emoji', '\u{1FABF}'],
  ['newer emoji', '\u{1F971}'],
  ['newer emoji', '\u{1F90C}'],
  // Scripts, spaces and marks: 1 up to U+10FF and in X's punctuation ranges, else 2.
  ['scripts and marks', '\u{5E9}\u{5DC}\u{5D5}\u{5DD}'],
  ['scripts and marks', '\u{393}\u{3B5}\u{3B9}\u{3AC}'],
  ['scripts and marks', '\u{E2A}\u{E27}\u{E31}\u{E2A}\u{E14}\u{E35}'],
  ['scripts and marks', '\u{10D2}\u{10D0}\u{10DB}\u{10D0}\u{10E0}\u{10EF}\u{10DD}\u{10D1}\u{10D0}'],
  ['scripts and marks', '\u{1230}\u{120B}\u{121D}'],
  ['scripts and marks', '\u{13E3}\u{13B3}\u{13A9}'],
  ['scripts and marks', 'tab\there'],
  ['scripts and marks', 'zero\u{200B}width'],
  ['scripts and marks', '\u{FEFF}bom'],
  ['scripts and marks', 'a\u{2028}b'],
  ['scripts and marks', '\u{200F}https://example.com'],
  ['scripts and marks', 'abc\u{200E}example.com'],
  ['scripts and marks', 'x\u{3000}y'],
  ['scripts and marks', '\u{2026}'],
  ['scripts and marks', '\u{2030}'],
  ['scripts and marks', '\u{2032}\u{2033}'],
  ['scripts and marks', '\u{2022}'],
  ['scripts and marks', '\u{B7}'],
  ['scripts and marks', '\u{20AC}'],
  ['scripts and marks', '\u{BD}'],
  ['scripts and marks', '\u{D83D}'],
  // Posts as the X adapter composes them.
  ['posts', 'Pebbles\n\nHow counting began.\n\n0:00 The start\n0:20 The middle\n0:40 The end\n\n#counting #kidsmaths'],
  ['posts', 'How footprint.js explains a run\n\nRuns on Node.js; open index.html to see it. More at https://footprintjs.github.io/footPrint/.\n\n#footprintjs'],
  ['posts', 'Little Aha Stories: counting\n\nEp 1 \u{2014} pebbles and sheep\n\nhttps://youtu.be/abc123 (the whole film)\n\n#kids #maths'],
  // The review's 72 (PR #22), each as it was compared.
  ['review', 'hello'],   // plain
  ['review', 'see https://example.com/a/very/long/path?q=1'],   // url
  ['review', 'storyreel.dev'],   // bare dev
  ['review', 'Node.js'],   // Node.js
  ['review', 'node.js'],   // node.js lower
  ['review', 'footprint.mjs'],   // footprint.mjs
  ['review', 'footprint.js'],   // footprint.js
  ['review', 'index.html'],   // index.html
  ['review', 'package.json'],   // package.json
  ['review', 'README.md'],   // README.md
  ['review', 'v0.4.0'],   // v0.4.0
  ['review', 'e.g. this'],   // e.g.
  ['review', 'mail sanjay@example.com now'],   // email
  ['review', '#node.js'],   // hashtag dotted
  ['review', '@storyreel.dev'],   // mention dotted
  ['review', 'see https://example.com.'],   // url trailing period
  ['review', '(https://example.com)'],   // url trailing paren
  ['review', 'watch https://example.com/video!!!'],   // url trailing bang
  ['review', 'https://example.com, then'],   // url trailing comma
  ['review', 'https://example.com/x?'],   // url trailing quote-ish
  ['review', 'see storyreel.dev.'],   // bare trailing period
  ['review', '詳しくはhttps://example.comをご覧ください。'],   // url then CJK
  ['review', '詳しくはexample.comをご覧ください。'],   // bare then CJK
  ['review', 'http://localhost:3000/very/long/path/that/goes/on'],   // localhost
  ['review', 'http://192.168.100.200/some/long/path/here'],   // ip
  ['review', 'x.com'],   // short url
  ['review', 'https://t.co/abc'],   // t.co
  ['review', 'example.xn--p1ai'],   // idn tld
  ['review', '👋🏽'],   // emoji wave skin
  ['review', '🇱🇺'],   // flag
  ['review', '👨\u{200D}👩\u{200D}👧'],   // zwj family
  ['review', '👋🏽 🇱🇺 👨\u{200D}👩\u{200D}👧'],   // test case
  ['review', '1\u{FE0F}\u{20E3}'],   // keycap
  ['review', '#\u{FE0F}\u{20E3}'],   // keycap hash
  ['review', '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],   // england flag
  ['review', '🏳\u{FE0F}\u{200D}🌈'],   // rainbow flag
  ['review', '❤\u{FE0F}\u{200D}🔥'],   // heart fire
  ['review', '©'],   // copyright
  ['review', '®'],   // registered
  ['review', '™'],   // tm
  ['review', '©\u{FE0F}'],   // copyright fe0f
  ['review', '❤'],   // heart bare
  ['review', '❤\u{FE0F}'],   // heart fe0f
  ['review', '🐶\u{200D}🐱'],   // non-rgi zwj
  ['review', '👍🏻🏼🏽🏾🏿'],   // stacked skin
  ['review', '🏽'],   // lone skin tone
  ['review', '🇱'],   // lone RI
  ['review', '🇱🇺🇸'],   // three RI
  ['review', '日本'],   // CJK
  ['review', 'e\u{301}'],   // decomposed e
  ['review', '— “quoted” …'],   // punct
  ['review', 'a\n\nb'],   // newline
  ['review', 'مرحبا'],   // arabic
  ['review', 'Привет'],   // cyrillic
  ['review', 'नमस\u{94D}त\u{947}'],   // devanagari
  ['review', '한국어'],   // korean
  ['review', 'नमस\u{94D}त\u{947} 👋'],   // hindi+emoji
  ['review', 'the end.Then more'],   // dot-joined sentence
  ['review', 'St.Louis'],   // St.Louis
  ['review', '1.5x speed'],   // version-ish 1.5x
  ['review', 'go to example.com/path, ok'],   // domain with path then text
  ['review', 'https://a.com https://b.org'],   // two urls
  ['review', 'https://en.wikipedia.org/wiki/Foo_(bar)'],   // url with parens path
  ['review', 'HTTPS://EXAMPLE.COM'],   // url uppercase
  ['review', 'ftp://example.com/file'],   // ftp
  ['review', 'www.example.com'],   // www
  ['review', 'foo_bar.com'],   // domain with underscore
  ['review', '-example.com'],   // domain preceded by dash
  ['review', 'a/example.com'],   // domain preceded by slash
  ['review', 'docs.x.com/resources'],   // sub.domain
  ['review', '$example.com'],   // dollar
  ['review', 'javascript:alert(1)'],   // javascript
];

// Invisible characters (marks, controls, format characters, spaces other than ' ') are written as \u escapes.
const visible = s => s.replace(/[\p{M}\p{C}\p{Z}]/gu, c => c === ' ' ? c : Array.from({length: c.length}, (_, i) => `\\u${c.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`).join(''));
const seen = new Set(), rows = [];
for (const [group, text] of cases) if (!seen.has(text)) { seen.add(text); rows.push({group, text, weightedLength: parseTweet(text).weightedLength}); }
const about = 'twitter-text 3.1.0 parseTweet(text).weightedLength, config v3 (emoji: twemoji-parser 11.0.2), run under Node by scripts/x-counts.mjs; test/release.test.mjs checks xLength against every row';
const out = new URL('../test/fixtures/x-counts.json', import.meta.url);
writeFileSync(out, `{\n  "about": ${JSON.stringify(about)},\n  "versions": ${JSON.stringify(versions)},\n  "rows": [\n${rows.map(r => `    ${visible(JSON.stringify(r))}`).join(',\n')}\n  ]\n}\n`);
console.log(`x-counts: ${rows.length} rows (${cases.length - rows.length} repeated texts written once) → test/fixtures/x-counts.json`);

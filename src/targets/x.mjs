/**
 * X (a video in a post): square 1080×1080 with the title band and burned-in captions — the feed autoplays muted,
 * and X's own captions are speech-to-text — up to 140 seconds for an account without Premium (Premium posts far
 * longer videos: override limits.seconds), and a post of at most 280 characters as X counts them (xLength: a link is
 * 23, an emoji 2, most scripts beyond Latin 2; Premium posts up to 25,000: override limits.text). X takes no caption
 * file and no thumbnail with a post, and its largest picture is 1920×1200 (1200×1900 tall): keep the scale at 1. A
 * post with one video makes the chapters' times ("1:05") clickable, so they go in when the post has room for them.
 * X is for people aged 13 and over: a film made for kids goes as a teaser for parents (audience 'general').
 */
import {clockText} from 'footprint-narration';

// X's own weights (twitter-text, config v3): these code points count 1, every other 2; a link counts 23, an emoji 2.
const LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const LINK = /\bhttps?:\/\/[^\s<>"]+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"]*)?/giu;
const EMOJI = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}️])*|\p{Regional_Indicator}{2}/gu;
const weight = (cp) => (LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2);

/** A post's length as X counts it (NFC first): a link is 23, an emoji 2, a code point of a light range 1, any other 2. */
export function xLength(text) {
  let n = 0;
  const rest = String(text).normalize('NFC').replace(LINK, () => { n += 23; return ''; }).replace(EMOJI, () => { n += 2; return ''; });
  for (const ch of rest) n += weight(ch.codePointAt(0));
  return n;
}

const MAX = 280;

export default {
  name: 'x', label: 'X',
  video: {format: 'square', header: true, captions: true},
  limits: {seconds: {min: 0.5, max: 140}, text: {text: {max: MAX, count: xLength}}},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  facts: {checked: '2026-10-08', sources: ['https://help.x.com/en/using-x/x-videos', 'https://help.x.com/en/using-x/x-premium', 'https://docs.x.com/resources/fundamentals/counting-characters', 'https://github.com/twitter/twitter-text/blob/master/config/v3.json', 'https://x.com/en/tos']},
  post(post, {chapters = [], limits} = {}) {
    const tags = post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    const text = [post.title, post.description, tags].filter(Boolean).join('\n\n');
    const withChapters = [post.title, post.description, chapters.map(([t, name]) => `${clockText(t)} ${name}`).join('\n'), tags].filter(Boolean).join('\n\n');
    const room = limits?.text?.text?.max ?? MAX;   // a Premium account's limit, when the release raises it
    return {text: chapters.length && xLength(withChapters) <= room ? withChapters : text};
  },
};

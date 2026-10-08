/**
 * X (a video in a post): square 1080×1080 with the title band and burned-in captions — X autoplays videos in the
 * timeline, and its own captions are speech-to-text and not on every video — up to 140 seconds for an account
 * without Premium (Premium posts far longer videos: override limits.seconds). The release gives X no caption file and
 * no thumbnail. X takes a video of at most 1920×1200 (1200×1900 tall): a larger render (scale 2 makes 2160×2160) is
 * refused before it starts (limits.frame).
 *
 * The post is at most 280 as X counts it (Premium posts up to 25,000: override limits.text): xLength is twitter-text
 * 3.1.0's count, the library X publishes for counting a post, ported (x-count/count.mjs) and pinned to it by
 * test/fixtures/x-counts.json — a link 23, an emoji 2, a code point 1 or 2 by its range. An emoji newer than that
 * library (Emoji 11.0) counts here as its parts, 2 or more, where X counts it 2: never less than X.
 *
 * A time written in a post with one video ("1:05") becomes a link to that moment — on iOS for now, X says, and at most
 * 50 in a post — so the film's chapters go in when there are at most 50 and the post has room for them. X is for
 * people aged 13 and over: a film made for kids goes as a teaser for parents (audience 'general').
 */
import {clockText} from 'footprint-narration';
import {weightedLength} from './x-count/count.mjs';

/** A post's length as X counts it: twitter-text 3.1.0's weighted length (x-count/count.mjs). */
export function xLength(text) {
  return weightedLength(String(text));
}

const MAX = 280, TIMES = 50;   // a post's length without Premium; the times in a post X makes into links

export default {
  name: 'x', label: 'X',
  video: {format: 'square', header: true, captions: true},
  limits: {seconds: {min: 0.5, max: 140}, text: {text: {max: MAX, count: xLength}}, frame: [{width: 1920, height: 1200}, {width: 1200, height: 1900}]},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  facts: {checked: '2026-10-08', sources: ['https://help.x.com/en/using-x/x-videos', 'https://help.x.com/en/using-x/x-premium', 'https://docs.x.com/resources/fundamentals/counting-characters', 'https://github.com/twitter/twitter-text/blob/master/config/v3.json', 'https://x.com/en/tos']},
  post(post, {chapters = [], limits} = {}) {
    const tags = post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ');
    const text = [post.title, post.description, tags].filter(Boolean).join('\n\n');
    const withChapters = [post.title, post.description, chapters.map(([t, name]) => `${clockText(t)} ${name}`).join('\n'), tags].filter(Boolean).join('\n\n');
    const max = limits?.text?.text?.max ?? MAX, count = limits?.text?.text?.count ?? xLength;   // the target's, overrides included
    return {text: chapters.length && chapters.length <= TIMES && count(withChapters) <= max ? withChapters : text};
  },
};

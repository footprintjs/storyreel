/**
 * YouTube (a video on the channel): wide 16:9 at 1920×1080, caption files beside it (YouTube shows its own), a
 * 1280×720 thumbnail, the description with the film's chapters (YouTube's rules: the first at 0:00, at least three,
 * each at least 10 s; shorter ones join the one before), "made for kids" set from the post's audience, and "altered
 * or synthetic content" set when the post declares something realistic made with AI (YouTube asks, e.g. for a
 * synthetic voice narrating).
 */
import {youtubeChapters} from 'footprint-narration';

export default {
  name: 'youtube', label: 'YouTube',
  video: {format: 'landscape', captionFiles: ['srt', 'vtt']},
  limits: {seconds: {min: 1, max: 12 * 3600}, text: {title: {max: 100}, description: {max: 5000}}},
  audience: {minAge: 13, kids: 'madeForKids'},   // (YouTube Kids and "made for kids" are where children watch)
  thumbnail: {width: 1280, height: 720, maxBytes: 2 * 1024 * 1024},
  facts: {checked: '2026-10-02', sources: ['https://support.google.com/youtube/answer/9884579', 'https://developers.google.com/youtube/v3/docs/videos#snippet.title', 'https://blog.youtube/news-and-events/disclosing-ai-generated-content']},
  post(post, {chapters, seconds}) {
    const length = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;   // (a part too short is the release's own refusal)
    const {lines} = youtubeChapters(chapters.map(([at, title]) => ({at, title})), {length});   // footprint-narration's rule
    return {title: post.title, description: [post.description, lines.join('\n')].filter(Boolean).join('\n\n'), tags: post.tags, madeForKids: post.audience === 'kids', alteredOrSynthetic: (post.synthetic ?? []).length > 0};
  },
};

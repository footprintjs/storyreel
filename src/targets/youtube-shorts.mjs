/**
 * YouTube Shorts: a vertical (or square) video of at most 3 minutes is a Short (since 15 October 2024). Tall
 * 1080×1920 with the title band and burned-in captions (most watch with the sound on, but not all); YouTube picks
 * the Short's frame, so no thumbnail. "Made for kids" follows the post's audience, as on a long video.
 */
export default {
  name: 'youtube-shorts', label: 'YouTube Shorts',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 1, max: 180}, text: {title: {max: 100}, description: {max: 5000}}},
  audience: {minAge: 13, kids: 'madeForKids'},
  thumbnail: null,
  facts: {checked: '2026-10-02', sources: ['https://support.google.com/youtube/answer/15424877', 'https://blog.youtube/news-and-events/disclosing-ai-generated-content']},
  post: (post) => ({title: post.title, description: [post.description, '#Shorts'].filter(Boolean).join('\n\n'), tags: post.tags, madeForKids: post.audience === 'kids', alteredOrSynthetic: (post.synthetic ?? []).length > 0}),
};

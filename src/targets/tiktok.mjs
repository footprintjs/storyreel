/**
 * TikTok: tall 1080×1920 with the title band and burned-in captions, up to 10 minutes (the default upload; some
 * accounts may post longer: override limits.seconds), a caption of at most 4,000 characters (only the first ~100
 * show). TikTok is for people aged 13 and over: a film made for kids goes as a teaser for parents.
 */
export default {
  name: 'tiktok', label: 'TikTok',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 1, max: 600}, text: {caption: {max: 4000}}},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  facts: {checked: '2026-10-02', sources: ['https://support.tiktok.com/en/using-tiktok/creating-videos/upload-a-video', 'https://www.tiktok.com/legal/page/us/terms-of-service/en']},
  post: (post) => ({caption: [post.title, post.description, post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n')}),
};

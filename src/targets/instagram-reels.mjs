/**
 * Instagram Reels: tall 1080×1920 with the title band and burned-in captions, up to 3 minutes in the app (since
 * January 2025; publishing through Instagram's API may allow less: override limits.seconds), a caption of at most
 * 2,200 characters (only the first ~125 show). Instagram is for people aged 13 and over: a film made for kids goes
 * as a teaser for parents.
 */
export default {
  name: 'instagram-reels', label: 'Instagram Reels',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 3, max: 180}, text: {caption: {max: 2200}}},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  facts: {checked: '2026-10-02', sources: ['https://help.instagram.com/270447560766967', 'https://help.instagram.com/581066165581870']},
  post: (post) => ({caption: [post.title, post.description, post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n')}),
};

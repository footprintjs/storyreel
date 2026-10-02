/**
 * LinkedIn (a native video in the feed): square 1080×1080 with the title band and burned-in captions (feeds play
 * muted), 3 s to 15 minutes (desktop upload), one post text of at most 3,000 characters — the first ~210 show
 * before "see more", so the title leads. LinkedIn is for people aged 16 and over: a film made for kids goes as a
 * teaser for parents (audience 'general').
 */
export default {
  name: 'linkedin', label: 'LinkedIn',
  video: {format: 'square', header: true, captions: true},
  limits: {seconds: {min: 3, max: 15 * 60}, text: {text: {max: 3000}}},
  audience: {minAge: 16, kids: 'refuse'},
  thumbnail: null,
  facts: {checked: '2026-10-02', sources: ['https://www.linkedin.com/help/linkedin/answer/a548372', 'https://www.linkedin.com/legal/user-agreement']},
  post: (post) => ({text: [post.title, post.description, post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n')}),
};

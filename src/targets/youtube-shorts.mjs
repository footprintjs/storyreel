/**
 * YouTube Shorts: a vertical (or square) video of at most 3 minutes is a Short (since 15 October 2024). Tall
 * 1080×1920 with the title band and burned-in captions (most watch with the sound on, but not all); YouTube picks
 * the Short's frame, so no thumbnail. "Made for kids" follows the post's audience, as on a long video.
 *
 * The player's own UI over the video (`ui`, zones.mjs), in fractions of the frame. YouTube publishes a safe zone only
 * for vertical video ADS (Google Ads Help, a 1080×1920 figure: 288 px top, 672 px bottom, 48 px left, 192 px right):
 * those numbers are `ui.ads`, read off Google's figure. An organic Short has no ad button at its foot, so its zones take
 * the top bar from that figure (measured), the left edge from its 48 px (a margin, not UI drawn there: an estimate),
 * the action column's WIDTH from its 192 px (measured)
 * starting half way down (an estimate: the like, comment, share and remix buttons sit in the lower half), and the
 * foot's title, channel and sound strip as the lower 22% (an estimate, 420 px: the published 672 px holds the ad's own
 * button too). Loudness: −14 LUFS integrated, −1 dBTP true peak (`loudness`; YouTube publishes no figure: see facts).
 */
export default {
  name: 'youtube-shorts', label: 'YouTube Shorts',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 1, max: 180}, text: {title: {max: 100}, description: {max: 5000}}},
  audience: {minAge: 13, kids: 'madeForKids'},
  thumbnail: null,
  ui: {
    zones: [
      {name: 'top bar', box: [0, 0, 1, .15], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .0444, 1], basis: 'estimate'},
      {name: 'action column', box: [.8222, .5, .1778, .5], basis: 'estimate'},
      {name: 'caption strip', box: [0, .78125, 1, .21875], basis: 'estimate'},
    ],
    ads: [
      {name: 'top bar', box: [0, 0, 1, .15], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .0444, 1], basis: 'estimate'},
      {name: 'action column', box: [.8222, 0, .1778, 1], basis: 'measured'},
      {name: 'caption strip', box: [0, .65, 1, .35], basis: 'measured'},
    ],
    covered: 'report',
  },
  loudness: {I: -14, TP: -1},
  facts: {checked: '2026-10-02', sources: ['https://support.google.com/youtube/answer/15424877', 'https://blog.youtube/news-and-events/disclosing-ai-generated-content'],
    ui: {checked: '2026-10-27', sources: ['https://support.google.com/google-ads/answer/9128498', 'https://support.google.com/google-ads/answer/16041697'],
      note: 'Google publishes the safe zone for vertical video ads only (its 1080×1920 figure: 288 top, 672 bottom, 48 left, 192 right). The top bar and the column\'s width are measured; the 48 px left margin is not UI drawn there, so the left edge is an estimate, and so are the organic action column\'s start and the caption strip'},
    loudness: {checked: '2026-10-27', sources: ['https://productionadvice.co.uk/td1008/', 'https://openclip.app/learn/audio-normalization'],
      note: 'YouTube publishes no loudness target; −14 LUFS is the level it is widely measured to turn louder videos down to (an estimate), −1 dBTP the AES TD1008 ceiling for lossy streams'}},
  post: (post) => ({title: post.title, description: [post.description, '#Shorts'].filter(Boolean).join('\n\n'), tags: post.tags, madeForKids: post.audience === 'kids', alteredOrSynthetic: (post.synthetic ?? []).length > 0}),
};

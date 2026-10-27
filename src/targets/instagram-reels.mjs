/**
 * Instagram Reels: tall 1080×1920 with the title band and burned-in captions, up to 3 minutes in the app (since
 * January 2025; publishing through Instagram's API may allow less: override limits.seconds), a caption of at most
 * 2,200 characters (only the first ~125 show). Instagram is for people aged 13 and over: a film made for kids goes
 * as a teaser for parents.
 *
 * The player's own UI over the video (`ui`, zones.mjs), in fractions of the frame. Meta publishes its safe zone for
 * Reels ADS as shares of the frame (the Ads Guide: 14% top, 35% bottom, 6% each side): those are `ui.ads`. An organic
 * Reel takes the top bar from them (measured). The 6% each side is a margin Meta asks of ads ("too close to edges on
 * taller screens"), not UI it draws: as edges, estimates. Meta gives no column, so the buttons' column is the right
 * 120 px from half way down (an estimate), and the foot's name, caption and sound the lower 22% (an estimate, 420 px:
 * the published 35% holds the ad's own button too). Loudness: −14 LUFS integrated, −1 dBTP true peak
 * (`loudness`; Instagram publishes no figure: see facts).
 */
export default {
  name: 'instagram-reels', label: 'Instagram Reels',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 3, max: 180}, text: {caption: {max: 2200}}},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  ui: {
    zones: [
      {name: 'top bar', box: [0, 0, 1, .14], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .06, 1], basis: 'estimate'},
      {name: 'right edge', box: [.94, 0, .06, 1], basis: 'estimate'},
      {name: 'action column', box: [.8889, .5, .1111, .5], basis: 'estimate'},
      {name: 'caption strip', box: [0, .78125, 1, .21875], basis: 'estimate'},
    ],
    ads: [
      {name: 'top bar', box: [0, 0, 1, .14], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .06, 1], basis: 'estimate'},
      {name: 'right edge', box: [.94, 0, .06, 1], basis: 'estimate'},
      {name: 'caption strip', box: [0, .65, 1, .35], basis: 'measured'},
    ],
    covered: 'report',
  },
  loudness: {I: -14, TP: -1},
  facts: {checked: '2026-10-02', sources: ['https://help.instagram.com/270447560766967', 'https://help.instagram.com/581066165581870'],
    ui: {checked: '2026-10-27', sources: ['https://www.facebook.com/business/ads-guide/update/video/instagram-reels'],
      note: 'Meta publishes the safe zone for Reels ads only (14% top, 35% bottom, 6% each side). The top bar is measured; the 6% sides are a margin Meta asks of ads, not UI it draws, so the edges are estimates, and so are the organic action column and caption strip'},
    loudness: {checked: '2026-10-27', sources: ['https://productionadvice.co.uk/td1008/', 'https://openclip.app/learn/audio-normalization'],
      note: 'Instagram publishes no loudness target; −14 LUFS is the common short-video goal (an estimate), −1 dBTP the AES TD1008 ceiling for lossy streams'}},
  post: (post) => ({caption: [post.title, post.description, post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n')}),
};

/**
 * TikTok: tall 1080×1920 with the title band and burned-in captions, up to 10 minutes (the default upload; some
 * accounts may post longer: override limits.seconds), a caption of at most 4,000 characters (only the first ~100
 * show). TikTok is for people aged 13 and over: a film made for kids goes as a teaser for parents.
 *
 * The player's own UI over the video (`ui`, zones.mjs), in fractions of the frame. TikTok publishes its safe zone as a
 * template for In-Feed ADS (TikTok Ads Manager help, "In-Feed Standard Version LTR", a 720×1280 picture measured pixel
 * by pixel: 160 px top, 80 px each side, a column 120 px wide inside the right edge from 720 px above the foot, 440 px
 * at the foot): those numbers are `ui.ads`. The top bar and the action column are the same in an organic post
 * (measured). The 80 px side bands are TikTok's numbers but not labelled: read as the edges a tall phone crops, they are
 * estimates. The foot has no ad button in a post, so the strip of name, caption and sound is the lower 22% (an
 * estimate, 420 px of 1920: the published 440 of 1280 holds the ad's own button too). Loudness: −14 LUFS integrated, −1 dBTP true
 * peak (`loudness`; TikTok publishes no figure: see facts).
 */
export default {
  name: 'tiktok', label: 'TikTok',
  video: {format: 'vertical', header: true, captions: true},
  limits: {seconds: {min: 1, max: 600}, text: {caption: {max: 4000}}},
  audience: {minAge: 13, kids: 'refuse'},
  thumbnail: null,
  ui: {
    zones: [
      {name: 'top bar', box: [0, 0, 1, .125], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .1111, 1], basis: 'estimate'},
      {name: 'right edge', box: [.8889, 0, .1111, 1], basis: 'estimate'},
      {name: 'action column', box: [.7222, .4375, .2778, .5625], basis: 'measured'},
      {name: 'caption strip', box: [0, .78125, 1, .21875], basis: 'estimate'},
    ],
    ads: [
      {name: 'top bar', box: [0, 0, 1, .125], basis: 'measured'},
      {name: 'left edge', box: [0, 0, .1111, 1], basis: 'estimate'},
      {name: 'right edge', box: [.8889, 0, .1111, 1], basis: 'estimate'},
      {name: 'action column', box: [.7222, .4375, .2778, .5625], basis: 'measured'},
      {name: 'caption strip', box: [0, .65625, 1, .34375], basis: 'measured'},
    ],
    covered: 'report',
  },
  loudness: {I: -14, TP: -1},
  facts: {checked: '2026-10-02', sources: ['https://support.tiktok.com/en/using-tiktok/creating-videos/upload-a-video', 'https://www.tiktok.com/legal/page/us/terms-of-service/en'],
    ui: {checked: '2026-10-27', sources: ['https://ads.tiktok.com/help/article/video-ads-specifications', 'https://lf-tt4b.tiktokcdn.com/obj/i18nblog/tt4b_cms/en-US/5jqet0ab9qci-10e7f5Vig4uhAscNP8XPB0.zip'],
      note: 'TikTok publishes the safe zone for In-Feed ads only (its template, 720×1280: 160 top, 80 each side, the button column 120 wide from 720 above the foot, 440 at the foot). The top bar and the column are measured; the side bands are not labelled in the template, so the edges (read as what a tall phone crops) are estimates, and so is the organic caption strip'},
    loudness: {checked: '2026-10-27', sources: ['https://productionadvice.co.uk/td1008/', 'https://openclip.app/learn/audio-normalization'],
      note: 'TikTok publishes no loudness target; −14 LUFS is the common short-video goal (an estimate), −1 dBTP the AES TD1008 ceiling for lossy streams'}},
  post: (post) => ({caption: [post.title, post.description, post.tags.map(t => `#${t.replace(/\s+/g, '')}`).join(' ')].filter(Boolean).join('\n\n')}),
};

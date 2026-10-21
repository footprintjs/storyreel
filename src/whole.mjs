/**
 * The picture strategies' contract, and the plainest one: every frame in one pass. A strategy has plan(job), one(job,
 * item) and join(job, done); render(job) runs them in order (makeFilm runs one() per item as a fan-out instead). The
 * default strategy is chosen in picture.mjs: pieces kept in a cache (segments.mjs), or this one when the cache cannot
 * hold the render (a part, an intro) or the caller asks for it.
 */
import path from 'node:path';

/** Every frame in one pass, the intro first (if any), the poster as the first frame, the stamp drawn into each frame. */
export function wholeVideo() {
  return {
    name: 'whole',
    plan: job => [{index: 0, f0: 0, f1: job.frames, whole: true}],
    async one(job) {
      const file = path.join(job.work, 'film-video.mp4');   // the picture without its sound: a working file
      await job.encodeFrames({file, withIntro: Boolean(job.withIntro), posterFirst: true});
      return {index: 0, status: 'rendered', frames: job.frames, file};
    },
    join: (job, [done]) => ({file: done.file}),
    async render(job) { return this.join(job, [await this.one(job, this.plan(job)[0])]); },
  };
}

/** A picture strategy has plan(job), one(job, item) and join(job, done); render(job) runs them in order. */
export function checkVideoStrategy(video) {
  if (!video || typeof video !== 'object' || !['plan', 'one', 'join', 'render'].every(k => typeof video[k] === 'function')) throw new Error('video must be a picture strategy: wholeVideo() or segmentedVideo({...}) (an object with plan, one, join and render)');
  return video;
}

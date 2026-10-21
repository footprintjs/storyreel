/**
 * A seeded stream of numbers in [0, 1) (mulberry32): the same seed gives the same stream on every frame and every
 * machine, so a torn edge, an ink blot or a thought cloud's scallops are a shape, not noise, and a frame stays a pure
 * function of time. Any finite seed works; its whole and fractional parts both count. A leaf: it imports nothing.
 */
export function seeded(seed) {
  const whole = Math.floor(seed);
  let s = (Math.imul(whole, 0x9e3779b1) ^ Math.round((seed - whole) * 1e6)) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export {contactSheet, transitionSheet} from '../index.js';
/**
 * One transition of a collection played between the sheet's two sample pictures: draw(c, u) paints it u of the way
 * through its change (eased as it eases; at or before 0 picture A, at or after 1 picture B) into c, whose transform maps
 * the 1600×900 frame. What the transitions sheet and the studio's gallery draw.
 */
export function transitionSample(name: string, catalog?: Record<string, Readonly<import('../index.js').BuiltInTransition>>): {name: string; family: string; seconds: number; draw(c: unknown, u: number): void};

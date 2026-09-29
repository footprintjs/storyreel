declare const sheepOut: string[];
declare const sheepHome: string[];
// --- on-screen code
const pebbles = sheepOut.map(() => 'pebble');
const leftOver = pebbles.length - sheepHome.length;
const allHome = leftOver === 0;
// --- end on-screen code ---
export { allHome };

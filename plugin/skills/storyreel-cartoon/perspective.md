# Perspective: place things in a room, not on the screen

A cartoon looks 3D because a layout artist sets one grid for the scene before anything is drawn: the camera's eye
height (the horizon) and a vanishing point. Every thing is then placed by where it stands on the FLOOR — across the
room, and how far back — and the grid says where it lands on the frame and how small it looks. Use
`footprint-storyreel/perspective` whenever a world has depth: a shop, a classroom, a street.

The rules, as a studio keeps them:
1. **One grid per set.** `perspective({horizon, vanish, front, focal})` once per world; every thing in it uses it.
2. **Place by floor and depth, never by screen size.** `room.at(x, depth, height)` gives `{x, y, scale}`: translate
   there, scale by `scale`. Nothing is sized by eye.
3. **Draw back to front.** `room.backToFront(items)` before drawing: overlaps always come out right.
4. **Angled things follow the room.** A rail, a counter, a road running into the room is a line from the front toward
   the vanishing point: `room.along(a, b, n)` spaces its items evenly; draw each at its own point, back to front. A
   wall facing us stays flat (one-point perspective).
5. **Depth in camera moves.** When the camera pans, `room.parallax(depth, shift)` moves far things less than near ones.

```js run
import assert from 'node:assert/strict';
import {perspective} from 'footprint-storyreel/perspective';

// A shop: eye height 430, the vanishing point near the middle, the floor's front edge at the frame's foot.
const room = perspective({horizon: 430, vanish: 860, front: 900, focal: 900});
// A rail of ten dresses running back into the room, 300 px off the floor: each one smaller and higher as it goes back.
const rail = room.along({x: 1150, depth: 0, height: 300}, {x: 1150, depth: 700, height: 300}, 10);
assert.ok(rail.every((p, i) => !i || (p.scale < rail[i - 1].scale && p.x < rail[i - 1].x)));
// Draw the furthest first, so each nearer dress overlaps the one behind it.
const order = room.backToFront(rail.map((p, j) => ({...p, j})));
assert.equal(order[0].j, 9);
// The boards of the floor run toward the vanishing point.
assert.deepEqual(room.toward(200), [[200, 900], [860, 430]]);
```

In a kit's draw: `for (const d of order) { ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.scale, d.scale); drawDress(ctx);
ctx.restore(); }`. Keep the people and what they hold in the front layer, at depth 0 or near it, so the action is never hidden.

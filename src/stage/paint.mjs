/**
 * The stage drawn through the kit's adapters, back to front: the place; things on the ground (a container's back,
 * what it holds, its front); each person, then what they hold; things on their way; count badges; the place's front.
 * A thing is drawn with its bottom centre at (0, 0): this module places, scales and fades it. Every adapter call is
 * wrapped in save/restore, so no drawing leaks into the next (Law 4).
 */

/** A count's number, the plain way (a kit may give its own badge): a round label that pops as each thing lands. */
export function plainBadge(ctx, {x, y, n, pop, done}) {
  const s = n === 1 ? Math.min(1, 1.15 * Math.sin(Math.PI / 2 * Math.min(1, pop * 1.4))) : 1 + .18 * Math.sin(Math.PI * pop);
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = done ? '#d9a521' : '#2e2c38'; ctx.stroke();
  ctx.fillStyle = '#2e2c38'; ctx.font = '700 40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), 0, 2);
}

/** Draw the stage's state (scene.mjs · stateAt) on ctx through the adapters. */
export function paintStage(plan, ctx, state) {
  const place = plan.stage.place.adapter, t = state.t, byLayer = new Map();
  for (const item of state.items) { if (!byLayer.has(item.layer)) byLayer.set(item.layer, []); byLayer.get(item.layer).push(item); }
  const call = (fn, ...args) => { ctx.save(); try { fn(ctx, ...args); } finally { ctx.restore(); } };
  const placed = (item, fn) => {
    if (!fn || !(item.opacity > 0)) return;
    const look = {x: item.x, y: item.y, sx: item.sx, sy: item.sy, scale: item.scale, opacity: item.opacity, open: item.open, count: item.count, k: item.k, t};
    call(c => { c.translate(item.x, item.y); c.scale(item.scale * item.sx, item.scale * item.sy); c.globalAlpha *= item.opacity; fn(c, look); });
  };
  const thing = item => {
    const adapter = plan.items.get(item.key).adapter;
    placed(item, adapter.draw);
    for (const inner of byLayer.get(`in:${item.key}`) ?? []) thing(inner);
    placed(item, adapter.front);
  };
  call(place.draw, t);
  for (const item of byLayer.get('ground') ?? []) thing(item);
  for (const pose of state.people) {
    call(plan.people.get(pose.who).adapter.draw, pose);
    for (const item of byLayer.get(`with:${pose.who}`) ?? []) thing(item);
  }
  for (const item of byLayer.get('flight') ?? []) thing(item);
  for (const b of state.badges) call(c => { c.globalAlpha *= b.opacity; (plan.adapters.badge ?? plainBadge)(c, b); });
  if (place.front) call(place.front, t);
}

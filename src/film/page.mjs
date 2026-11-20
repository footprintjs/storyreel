/**
 * Stage 13 of the compile: the page — the blank paper every picture is drawn over, the recall images (filled by the
 * stills stage), which stages show at t and what the card shows (stateAt), and what a stage draws at t (stageSpec).
 * Its own stage because the page's state at t is one answer, read by the drawing and the regions alike, so a box
 * always agrees with what is drawn.
 *
 * Reads: paper, stages, card, geo, push, buildStage, centreStage, centrePlace.
 * Writes: blank, recalls, stateAt(t), kitCardBox(), stageSpec(st, t).
 */
import {createCanvas} from '@napi-rs/canvas';
import {inOut as ease} from '../ease.mjs';
import {makePen} from '../pen.mjs';
import {paperGround} from '../ground.mjs';
import {ramp} from '../clock.mjs';
import {drawSummary, drawConnector, cardEdge, PANEL, drawRecap, recapSlotBox, drawRecallFramed} from '../kits/paper/paper.mjs';
import {into} from './util.mjs';

export function pageStage(state) {
  const {paper, stages, card, geo, push, buildStage, centreStage, centrePlace} = state;
  const blank = createCanvas(1600, 900);
  { const c = blank.getContext('2d'); c.fillStyle = paper.palette.bg; c.fillRect(0, 0, 1600, 900); paperGround(makePen(c, paper, {baseScale: 1}), paper.background); }
  const recalls = {};

  /** Which stages show at t, with their weights, and what the card shows. */
  function stateAt(t) {
    const shown = [];
    stages.forEach((st, i) => {
      // Hand-over, not a crossfade: the old stage leaves before the new one arrives (titles never overlap).
      const next = stages[i + 1], enter = i === 0 ? 1 : into(st, t, .2, .45), leave = next ? 1 - into(next, t, .65, .45) : 1;
      const w = Math.min(enter, leave); if (w > 0) shown.push([st, w]);
    });
    let rows = card.template, glow = {};
    const current = [...stages].reverse().find(s => t >= s.start - (s.cut ? 0 : .5)) ?? buildStage;
    for (const g of current.glowAt ?? []) glow[g.row] = Math.max(glow[g.row] ?? 0, Math.min(ease((t - g.a) / .35), 1 - ease((t - g.b) / .45)));
    let pop = {};
    if (current.kit?.card) ({rows, glow, pop} = current.kit.card(current.handle, t));
    const columns = {};
    for (const k of current.columnsAt ?? []) columns[k.key] = Math.max(columns[k.key] ?? 0, Math.min(ease((t - k.a) / .35), 1 - ease((t - k.b) / .45)));
    const afterCentre = centreStage && stages[stages.indexOf(centreStage) + 1];
    const centre = centreStage ? Math.min(into(centreStage, t, .5, .9), 1 - (afterCentre ? into(afterCentre, t, .5, .9) : 0)) : 0;
    const summary = stages.find(s => s.cardsAt || s.type === 'recap');
    // A stage with card: false has the whole page: the card leaves while it plays and comes back after.
    let hidden = 0;
    stages.forEach((st, i) => { if (st.card === false) { const next = stages[i + 1]; hidden = Math.max(hidden, Math.min(into(st, t, .5, .6), next ? 1 - into(next, t, .5, .6) : 1)); } });
    const fade = (summary ? 1 - into(summary, t, .5, .6) : 1) * (1 - hidden);
    return {shown, rows, glow, pop, centre, fade, columns};
  }

  /** The recap's playhead at t: eased hops between the named keys. */
  function recapFocus(st, t) {
    let f = st.keysAt[0].f;
    for (const k of st.keysAt.slice(1)) { if (t < k.t) break; const u = ease(Math.min(1, (t - k.t) / .9)); f = f + (k.f - f) * u; }
    return f;
  }
  /** The card's box once it sits in the middle of a kit's scene: [x, y, w, h] (e.g. for a border beam). */
  function kitCardBox() {
    const [x0, y0] = geo.pushed(card.prop[0], card.prop[1]), [x1, y1] = geo.pushed(card.prop[2], card.prop[3]), {at: [lx, ly], scale: s} = centrePlace;
    return [lx - (x1 - x0) * s / 2, ly - (y1 - y0) * s / 2, (x1 - x0) * s, (y1 - y0) * s];
  }
  function stageSpec(st, t) {
    const out = {chip: st.chip, chipDark: st.chipDark, title: st.title, file: st.file, label: st.label, lh: st.lh, chrome: st.chrome, panel: st.type === 'code' || st.type === 'api' ? undefined : false};
    // Without a card, a stage has the page to itself: its panel is centred.
    if (!push) out.panelX = (1600 - PANEL.PW) / 2;
    if (st.lines) { out.code = st.lines; out.codeSize = st.code.size; out.shown = i => { const r = st.reveal.find(([n]) => n === i); return r ? (t - r[1]) / .55 : 0; }; }
    // A code line and the card line it defines are joined while the voice names them.
    const links = (st.glowAt ?? []).filter(g => g.lines).map(g => ({...g, w: Math.min(ease((t - g.a) / .35), 1 - ease((t - g.b) / .45))})).filter(g => g.w > 0);
    if (links.length && st.lines) out.custom = (c, P) => links.forEach(g => {
      const row = card.rows.find(r => r.key === g.row), [rx, ry] = cardEdge(geo, card, card.aside, row.by), tone = card.template[g.row].tone;
      const lh = st.lh ?? 36, y = PANEL.Y0 + 92 + ((g.lines[0] + g.lines[1]) / 2) * lh;
      drawConnector(c, P, [PANEL.X0 - 6, y], [rx + 6, ry], P.C[tone], g.w, t);
    });
    out.focus = st.focusAt.map(f => ({from: f.from, to: f.to, tone: f.tone, w: Math.min(ramp(t, f.a, .35), 1 - ramp(t, f.b, .4))}));
    if (st.marksAt.length) out.marks = st.marksAt.map(m => ({line: m.line, icon: m.icon, w: Math.min((t - m.a) / .45, 1 - ramp(t, m.b, .4))}));
    if (st.footerAt !== undefined) out.footer = [st.footer.text, st.footer.tone ?? 'accent', ramp(t, st.footerAt)];
    if (st.listAt) out.list = st.listAt.map(item => [item.what, item.detail, ramp(t, item.t)]);
    if (st.kit) out.custom = (c, P) => st.kit.draw(c, P, paper, st.handle, t, push ? kitCardBox() : null);
    if (st.type === 'recap') out.custom = (c, P) => {
      // Match cut in: the last screen shrinks into its place at the end of the strip.
      const last = st.frames.length - 1, shrink = ease(ramp(t, st.start - .3, 1.1)), to = recapSlotBox(last, 1.55);
      drawRecap(c, P, st.frames.map(fr => ({...fr, image: recalls[fr.recall]})), {f: recapFocus(st, t), enter: ramp(t, st.start + .3, .7), hide: shrink < 1 ? last : -1, t});
      if (shrink < 1 && recalls[st.frames[last].recall]) drawRecallFramed(c, P, recalls[st.frames[last].recall], ...[0, 0, 1600, 900].map((v, j) => v + (to[j] - v) * shrink), shrink);
    };
    if (st.cardsAt) out.custom = (c, P) => drawSummary(c, P, st.cardsAt.map(k => ({...k, alpha: ramp(t, k.t), image: k.recall ? recalls[k.recall] : null})),
      st.closingAt !== undefined ? {text: st.closing.text, alpha: ramp(t, st.closingAt)} : null,
      st.heroAt ? {text: st.heroAt.text, sub: st.heroAt.sub, image: recalls[st.heroAt.recall], alpha: ramp(t, st.start - .3, .6), morph: ramp(t, st.heroAt.until - .2, .9),
        into: st.cardsAt.findIndex(k => k.recall === st.heroAt.recall)} : null);
    return out;
  }
  Object.assign(state, {blank, recalls, stateAt, kitCardBox, stageSpec});
}

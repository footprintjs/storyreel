/**
 * The page family's paper ones. Curl: the old page's corner curls over, its back showing, the new page beneath. Fold:
 * the old picture folds shut along its middle and the new one pops open from the crease.
 */
import {W, H, smooth} from '../../frame.mjs';
import {rgba} from '../../colour.mjs';
import {paperTokens} from '../../paper-tokens.mjs';

const CORNERS = Object.freeze({'bottom-right': [W, H], 'bottom-left': [0, H], 'top-right': [W, 0], 'top-left': [0, 0]});
const DIAGONAL = Math.hypot(W, H), FAR = 6000;

/**
 * The fold line crosses the page's diagonal, from the corner (nothing lifted) to just past the far corner (the whole
 * page lifted, its back off the frame). Beyond the fold the new picture is uncovered; the lifted part lies folded back
 * over the old page, darker at the crease.
 */
function curl(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), corner = CORNERS[p.corner];
  const towardCorner = [(2 * corner[0] - W) / DIAGONAL, (2 * corner[1] - H) / DIAGONAL], alongFold = [-towardCorner[1], towardCorner[0]];
  const travelled = DIAGONAL * 1.05 * e, foldPoint = [corner[0] - towardCorner[0] * travelled, corner[1] - towardCorner[1] * travelled];
  /** The half-plane on the `side` of the fold line (+1: toward the lifting corner). */
  const half = side => {
    const [mx, my] = foldPoint, [ax, ay] = alongFold, [nx, ny] = towardCorner;
    ctx.beginPath(); ctx.moveTo(mx + ax * FAR, my + ay * FAR); ctx.lineTo(mx - ax * FAR, my - ay * FAR);
    ctx.lineTo(mx - ax * FAR + side * nx * FAR, my - ay * FAR + side * ny * FAR); ctx.lineTo(mx + ax * FAR + side * nx * FAR, my + ay * FAR + side * ny * FAR); ctx.closePath();
  };
  to(ctx);
  ctx.save(); half(-1); ctx.clip(); from(ctx); ctx.restore();
  // The flap: the lifted part reflected over the fold line, showing the page's back.
  const [ax, ay] = alongFold, [mx, my] = foldPoint, r00 = ax * ax - ay * ay, r01 = 2 * ax * ay, r11 = ay * ay - ax * ax;
  ctx.save(); ctx.transform(r00, r01, r01, r11, mx - (r00 * mx + r01 * my), my - (r01 * mx + r11 * my));
  half(1); ctx.clip(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  const g = ctx.createLinearGradient(mx, my, mx + towardCorner[0] * 400, my + towardCorner[1] * 400); g.addColorStop(0, t.fold); g.addColorStop(1, t.back);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  // A soft shade along the crease on the page side, coming in with the first moments of the curl.
  const shade = .3 * smooth(0, .05, e), sg = ctx.createLinearGradient(mx, my, mx - towardCorner[0] * 70, my - towardCorner[1] * 70);
  sg.addColorStop(0, rgba(t.ink, shade)); sg.addColorStop(1, rgba(t.ink, 0));
  ctx.fillStyle = sg; half(-1); ctx.fill();
}

/** Closing: the halves turn edge-on (cos); opening: they spring back open a little early, the pop (1.06 sin, held at 1). */
const openness = e => (e < .5 ? Math.cos(e / .5 * Math.PI / 2) : Math.min(1, 1.06 * Math.sin((e - .5) / .5 * Math.PI / 2)));

function fold(ctx, {e, from, to, p, theme}) {
  const t = paperTokens(theme), vertical = p.line === 'vertical', crease = (vertical ? W : H) / 2, open = openness(e), paint = e < .5 ? from : to;
  ctx.fillStyle = t.ground; ctx.fillRect(0, 0, W, H);
  for (const first of [true, false]) {
    const at = first ? 0 : crease, rect = vertical ? [at, 0, crease, H] : [0, at, W, crease];
    ctx.save(); ctx.beginPath(); ctx.rect(...rect); ctx.clip();
    if (vertical) { ctx.translate(crease, 0); ctx.scale(Math.max(.001, open), 1); ctx.translate(-crease, 0); } else { ctx.translate(0, crease); ctx.scale(1, Math.max(.001, open)); ctx.translate(0, -crease); }
    paint(ctx);
    ctx.fillStyle = rgba(t.ink, .35 * (1 - open)); ctx.fillRect(...rect); ctx.restore();
  }
  ctx.strokeStyle = rgba(t.ink, .4 * Math.sin(e * Math.PI)); ctx.lineWidth = 3; ctx.beginPath();
  if (vertical) { ctx.moveTo(crease, 0); ctx.lineTo(crease, H); } else { ctx.moveTo(0, crease); ctx.lineTo(W, crease); }
  ctx.stroke();
}

export const CURL = {family: 'page', seconds: 1.2, ease: 'inOut', sound: 'slide', params: {corner: {oneOf: Object.keys(CORNERS), default: 'bottom-right'}}, draw: curl};
export const FOLD = {family: 'page', seconds: 1.2, ease: 'inOut', sound: 'slide', params: {line: {oneOf: ['horizontal', 'vertical'], default: 'horizontal'}}, draw: fold};

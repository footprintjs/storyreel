/**
 * What a segmented render drew, in one short line an agent can afford to read:
 *
 *   picture: 3 of 41 pieces drawn (title: shot code changed; forward 12–18 s: words changed), 38 reused
 *
 * Pieces drawn for the same reason are said together ("6 pieces: StoryReel's drawing code changed"); at most `top`
 * reasons are listed, the rest counted ("+2 more: full: true lists them"). The making-of record keeps every piece and
 * its reason (`picture.segments[i].why`).
 */

/** The line for a strategy's report ({rendered, reused, segments: [{label?, status, why?}]}); `full`: every reason. */
export function pictureLine(report, {full = false, top = 5} = {}) {
  if (!report?.segments) return 'picture: drawn whole (every frame in one pass)';
  const drawn = report.segments.filter(s => s.status === 'rendered'), total = report.segments.length;
  // What weakens the keys (report.note) closes the line: an agent reads only the line.
  const note = report.note ? ` · note: ${report.note}` : '';
  if (!drawn.length) return `picture: all ${total} pieces reused${note}`;
  const groups = new Map();
  for (const s of drawn) { const why = s.why ?? 'new'; groups.set(why, [...(groups.get(why) ?? []), s.label ?? `piece ${s.index}`]); }
  const said = [...groups].map(([why, labels]) => labels.length > 2 ? `${labels.length} pieces: ${why}` : `${labels.join(', ')}: ${why}`);
  const shown = full ? said : said.slice(0, top), more = said.length - shown.length;
  return `picture: ${drawn.length} of ${total} pieces drawn (${shown.join('; ')}${more ? `; +${more} more: full: true lists them` : ''}), ${total - drawn.length} reused${note}`;
}

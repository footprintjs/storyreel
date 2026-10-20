/**
 * The credit lines for the found sounds a film plays (release.mjs · creditsText puts them under "Sounds" in CREDITS.txt),
 * written from their records, never typed by hand. A CC BY or CC BY-SA licence asks for the attribution, the licence
 * and, since a sound mixed into a film is adapted, that it was changed, with a link to the work where one is known
 * (CC 4.0 §3(a)); a CC BY-SA sound also says the film is shared under CC BY-SA.
 */
import {foundRecord} from './record.mjs';

export function creditLines(records) {
  const lines = records.map(r => foundRecord(r)).map(r => {
    const deed = r.licenseUrl && !r.attribution.includes(r.licenseUrl) ? ` (${r.licenseUrl})` : '';
    const adapted = r.license === 'cc0' ? '' : ` — adapted: mixed into this film${r.landing ? ` (the work: ${r.landing})` : ''}`;
    return `- ${r.attribution}${deed}${adapted}`;
  });
  return lines.length && records.some(r => r.license === 'by-sa')
    ? [...lines, '', 'Because it uses sounds under CC BY-SA, this film is shared under CC BY-SA 4.0 too (https://creativecommons.org/licenses/by-sa/4.0/).'] : lines;
}

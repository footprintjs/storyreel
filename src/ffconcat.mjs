/**
 * FFmpeg's concat list, written one way for every join (the voice, the effects, the picture's pieces): each path
 * absolute and quoted, a quote in it written '\'' (a folder called "Sanjay's films" is fine). A line break cannot be
 * written in such a list (it would end the entry and start another, naming any file), so a path with one — or with a
 * NUL, which no path may hold — is refused.
 */
import path from 'node:path';

export function concatList(files) {
  return files.map(f => {
    const p = path.resolve(f);
    if (/[\r\n\0]/.test(p)) throw new Error(`render: ${JSON.stringify(p)} has a line break, which ffmpeg's concat list cannot hold: rename it`);
    return `file '${p.replace(/'/g, "'\\''")}'`;
  }).join('\n') + '\n';
}

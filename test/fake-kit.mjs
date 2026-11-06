// A voice kit shaped like a real one, for tests: its "python" is a small Node script that writes a silent WAV and the timed
// words for each scene, says something on stdout as a kit does, and notes each line, so a test can see that it ran or did not.
import {chmodSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const PYTHON = `#!/usr/bin/env node
const {appendFileSync, readFileSync, writeFileSync} = require('node:fs'), path = require('node:path');
const at = (flag) => process.argv[process.argv.indexOf(flag) + 1];
const {scenes} = JSON.parse(readFileSync(at('--storyboard'), 'utf8')), out = at('--out');
console.log('loading the model … a line a kit prints');
const wav = (seconds) => {
  const data = Buffer.alloc(Math.round(seconds * 16000) * 2), head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
};
const timed = scenes.map((s) => {
  const words = s.narration.split(/\\s+/).filter(Boolean).map((text, i) => ({text, start: +(i * 0.3).toFixed(2), end: +(i * 0.3 + 0.25).toFixed(2)}));
  const duration = +(words.length * 0.3 + 0.2).toFixed(2);
  writeFileSync(path.join(out, s.id + '.wav'), wav(duration));
  appendFileSync(path.join(__dirname, 'said.log'), s.narration + '\\n');
  return {id: s.id, audio: s.id + '.wav', duration, words};
});
writeFileSync(path.join(out, 'timings.json'), JSON.stringify({scenes: timed}));
`;

/** Make the kit in `dir`; {kit, said()}: its folder, and the lines it has voiced so far. */
export function fakeKit(dir) {
  mkdirSync(path.join(dir, '.venv-voice', 'bin'), {recursive: true});
  mkdirSync(path.join(dir, 'voices'), {recursive: true});
  const python = path.join(dir, '.venv-voice', 'bin', 'python');
  writeFileSync(python, PYTHON);
  chmodSync(python, 0o755);
  writeFileSync(path.join(dir, 'package.json'), '{"type":"commonjs"}');
  writeFileSync(path.join(dir, 'voices', 'me.voice.json'), JSON.stringify({id: 'me', seed: 7, consent: 'a private note'}));
  const said = () => { try { return readFileSync(path.join(path.dirname(python), 'said.log'), 'utf8').trim().split('\n'); } catch { return []; } };
  return {kit: dir, said};
}

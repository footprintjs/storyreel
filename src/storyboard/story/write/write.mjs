/**
 * The write: the board from the points and the messages they cite, never the whole conversation, so the writer cannot cite
 * what it was not shown. The instructions are the storyboard door's own for the shape (storyboardBrief), with one line
 * more on the points; the points and the cited messages are material.
 */
import {dataLine, storyboardBrief} from 'footprint-story/storyboard';
import {MalformedAnswer, brief, isRecord} from '../port/port.mjs';
import {clipMessage} from '../read-source/source.mjs';

/** The most bytes one cited message's line may take in the write brief. */
export const MOST_CITED_BYTES = 4096;

const POINTS = 'Before the messages come the points to tell, one per line, each {"point": {"part", "text", "sources"}}: write one entry for each point, in its part, citing its sources.';

/**
 * The write brief: {brief, left}. Messages go in the conversation's order while the brief stays under `most` bytes; `left`
 * counts those left out (the check still reads every message, whole).
 */
export function writeBrief(shape, points, cited, most) {
  const pointLines = points.map(({part, text, sources}) => dataLine({point: {part, text, sources}}));
  let room = most - pointLines.reduce((n, line) => n + Buffer.byteLength(line) + 1, 0), left = 0;
  const shown = [];
  for (const message of cited.map((m) => clipMessage(m, MOST_CITED_BYTES))) {
    const size = Buffer.byteLength(dataLine(message)) + 1;
    if (size > room) { left++; continue; }
    shown.push(message);
    room -= size;
  }
  const door = storyboardBrief(shape, {conversation: shown});
  const material = [...pointLines, ...(door.material ? [door.material] : [])].join('\n');
  return {brief: brief('write', `${door.instructions}\n${POINTS}`, material, shown.map((m) => m.id)), left};
}

/** The write answer read: a board as plain data, checked whole by the next stage. */
export function readBoard(answer) {
  if (!isRecord(answer)) throw new MalformedAnswer('write', 'not-object');
  return answer;
}

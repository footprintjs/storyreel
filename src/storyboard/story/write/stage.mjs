/** The write stage: one ask for the whole board. The board's words stay in working memory; state gets its size. */
import {stopRun} from '../engine.mjs';
import {askOrRefuse} from '../port/ask.mjs';
import {readBoard, writeBrief} from './write.mjs';

export const WRITE_REFUSED = 'the model gave no board that is a JSON object, twice: run again, or check the model answers with one JSON object';

export async function write(scope, run) {
  const points = run.work.points, ids = [...new Set(points.flatMap((p) => p.sources))];
  const {brief: b, left} = writeBrief(scope.shape, points, run.source.cited(ids), scope.windowBytes);
  const got = run.work.written ?? await askOrRefuse(scope, run, b, readBoard);
  run.work.written = got;
  scope.written = {cited: b.ids.length, leftOut: left, ...(got.refused ? {refused: got.refused} : {bytes: Buffer.byteLength(JSON.stringify(got.value))})};
  if (got.refused) {
    scope.stopped = {at: 'write', why: 'model-refused'};
    return stopRun(scope, WRITE_REFUSED);
  }
  run.work.board = got.value;
  scope.fixRound = 0;
  scope.fixes = [];
}

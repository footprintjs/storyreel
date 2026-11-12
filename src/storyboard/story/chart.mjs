/**
 * The story chart, wiring only: a conversation in, a checked storyboard out, with a standing per scene. Each stage's logic
 * lives in its own folder; engine.mjs builds this list with footprintjs. `run` is one run's context: its input, the model's
 * driver, the source once opened, and the working memory that holds every word (state never does).
 */
import {ASK_RETRY} from './port/port.mjs';
import {readSource} from './read-source/stage.mjs';
import {route, startPicking} from './route/route.mjs';
import {advance, nextWindow, pick} from './pick/stage.mjs';
import {merge} from './merge/stage.mjs';
import {chooseShape, noShape, shapeAsked, shapeFits} from './choose-shape/stage.mjs';
import {write} from './write/stage.mjs';
import {check, judge} from './check/stage.mjs';
import {fix} from './fix/stage.mjs';
import {done, stop} from './done/stage.mjs';

export function storyWiring(run) {
  const with_ = (fn) => (scope) => fn(scope, run);
  return [
    {id: 'read-source', name: 'read source', about: 'The conversation opened: its counts, bytes, hash and windows, never its words', run: with_(readSource)},
    {id: 'route', name: 'route', about: 'One pick brief, or one per window', run: route, branches: [
      {id: 'one-brief', name: 'one brief', about: 'The whole conversation in one window', run: startPicking},
      {id: 'windowed', name: 'windowed', about: 'The conversation window by window', run: startPicking},
    ]},
    {id: 'pick', name: 'pick', about: 'What matters in one window, as points with their sources', run: with_(pick), retry: ASK_RETRY},
    {id: 'next-window', name: 'next window', about: 'Another window, or all picked', run: nextWindow, branches: [
      {id: 'more-windows', name: 'more windows', about: 'On to the next window', run: advance, loopTo: 'pick'},
      {id: 'all-picked', name: 'all picked', about: 'Every window picked', run: () => {}},
    ]},
    {id: 'merge', name: 'merge', about: 'The windows\' points as one list; a disagreement marked ask', run: with_(merge)},
    {id: 'choose-shape', name: 'choose shape', about: 'The shape, from the drawable shapes the points fill', run: with_(chooseShape), branches: [
      {id: 'shape-fits', name: 'shape fits', about: 'One shape fits', run: shapeFits},
      {id: 'shape-asked', name: 'shape asked', about: 'Two or more fit: the model chooses', run: with_(shapeAsked), retry: ASK_RETRY},
      {id: 'no-shape', name: 'no shape', about: 'None fits: the run stops, saying why', run: noShape},
    ]},
    {id: 'write', name: 'write', about: 'The board from the points and the messages they cite', run: with_(write), retry: ASK_RETRY},
    {id: 'check', name: 'check', about: 'The board read against the whole conversation, and by a film', run: with_(check)},
    {id: 'judge', name: 'judge', about: 'Done, fix one piece at a time, or stop', run: judge, branches: [
      {id: 'fix', name: 'fix', about: 'Each piece at fault sent back on its own, each with its own tries', run: with_(fix), loopTo: 'check'},
      {id: 'board-ok', name: 'done', about: 'The board, with a standing per scene', run: with_(done)},
      {id: 'stop', name: 'stop', about: 'Fix rounds used up: the problems on the record, no board', run: stop},
    ]},
  ];
}

/** The read-source stage: the conversation opened as a source, and only its facts written to state. */
import {openSource} from './source.mjs';

export function readSource(scope, run) {
  run.source = openSource(run.input.conversation, {cwd: run.input.cwd, window: run.input.window});
  const {messages, bytes, sha256, clipped, window, windows} = run.source.facts;
  scope.source = {messages, bytes, sha256, clipped};
  scope.windowBytes = window;
  scope.windows = windows.map(({from, to, bytes: size}) => ({from, to, bytes: size}));
  scope.windowCount = windows.length;
}

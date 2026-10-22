// A project for the script tool's tests (tools.mjs · script) and the anchors' holds at moments: moments and speaker tags
// in the narration, a scene's own speaker, a number slot in a line, a line separator (U+2028) a reader of lines would
// split at, a silent scene (said by nobody: left out) and a cast whose names go into what is said. --bad: a mark not as
// written. --holds: a hold at a moment the scene has, and one at a moment it does not (its last word is said earlier too).
const LS = String.fromCodePoint(0x2028);
export default {
  film: flags => ({
    storyboard: {title: 'Script', scenes: flags.holds ? [
      {id: 'today', narration: 'Ten ones {dots} make a ten {hop}. {@mom}"And ten tens?" One ten, one ten.'},
      {id: 'next', narration: 'That is how a ten is made.'}] : [
      {id: 'open', silent: [['the door opens', 1]]},
      {id: 'today', speaker: 'grandma', narration: flags.bad ? 'Ten ones {dots make a ten.' : 'Ten ones {dots} make a ten {hop}.'},
      {id: 'talk', narration: '{{mom}} walks in. {@mom}"What are you two up to?" {@amaira}"Mom! I can add 16 and 24 now!"', say: [['16', 'sixteen'], ['24', 'twenty-four']]},
      {id: 'frame', narration: `One frame takes {fast}16.67 ms.${LS}That is fast.`, say: [['16.67 ms', 'sixteen point six seven milliseconds']]}]},
    cast: {mom: {name: 'Mom'}},
    recipe: {story: {kit: 'whiteboard', items: flags.holds ? [{at: ['today', '{dots}'], dur: .5, draw: [['figure', 300, 620, 1]]}] : []}},
    ...(flags.holds ? {pacing: {sceneTail: .8, holds: [{scene: 'today', after: '{dots}', seconds: 1.5}, {scene: 'today', after: '{gone}', seconds: 1}]}} : {}),
  }),
};

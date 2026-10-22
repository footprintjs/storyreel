// A project for the script tool's tests (tools.mjs · script): moments and speaker tags in the narration, a number slot,
// a silent scene (said by nobody: left out) and a cast whose names go into what is said. --bad: a mark not as written.
export default {
  film: flags => ({
    storyboard: {title: 'Script', scenes: [
      {id: 'open', silent: [['the door opens', 1]]},
      {id: 'today', narration: flags.bad ? 'Ten ones {dots make a ten.' : 'Ten ones {dots} make a ten {hop}.'},
      {id: 'talk', narration: "{{mom}} walks in. {@mom}'What are you two up to?' {@amaira}'Mom! I can add big numbers now!'"},
      {id: 'frame', narration: 'One frame takes {fast}16.67 ms.', say: [['16.67 ms', 'sixteen point six seven milliseconds']]}]},
    cast: {mom: {name: 'Mom'}},
    recipe: {story: {kit: 'whiteboard', items: []}},
  }),
};

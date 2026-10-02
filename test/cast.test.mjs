// The cast (cast.mjs): who is in the film as configuration — {{role}} in the text becomes the role's name before
// anything reads it, kits get the cast (context.cast, a stage's compile options), and it is part of what the film is made from.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compileFilm, evenTimings, readCast, castText, withCast} from '../src/index.mjs';

const storyboard = {title: 'Cast', scenes: [{id: 'shop', narration: '{{hero}} is helping today. {{mom}} smiles at {{hero}}.'}]};
let seen = null;
const shop = {name: 'shop', story: {context: true, compile: (spec, ctx) => { seen = ctx.cast; return {hang: 1, draw: (c) => { c.fillStyle = ctx.cast.hero.dress; c.fillRect(0, 0, 1600, 900); }}; }}};
const recipe = {story: {kit: 'shop', at: ['shop', '{{hero}} is helping']}};
const timingsOf = cast => evenTimings(withCast(storyboard, readCast(cast)));

test('one film, another cast: the names said, the phrases found and the look the kit draws all come from the cast', async () => {
  const tamil = {hero: {name: 'Amaira', dress: '#d94f70'}, mom: {name: 'Amma'}};
  const film = await compileFilm({storyboard, timings: timingsOf(tamil), recipe, kits: [shop], cast: tamil});
  assert.deepEqual(film.clock.words('shop').map(w => w.text).slice(0, 2), ['Amaira', 'is']);
  assert.ok(film.clock.at(['shop', 'Amma smiles']) > 0, 'a phrase with a name is found under the name');
  assert.equal(seen.hero.dress, '#d94f70'); assert.ok(Object.isFrozen(seen.hero), 'the kit gets the cast frozen');
  assert.ok(film.inputs.cast, 'the cast is part of what the film is made from');
  const other = await compileFilm({storyboard, timings: timingsOf({...tamil, mom: {name: 'Amma garu'}}), recipe, kits: [shop], cast: {...tamil, mom: {name: 'Amma garu'}}});
  assert.notEqual(other.inputs.cast, film.inputs.cast);
});

test('refusals name the fix: a {{role}} the cast lacks, a role without a name, no cast at all', () => {
  assert.throws(() => castText('Hi {{dad}}', readCast({hero: {name: 'A'}})), /names \{\{dad\}\}, which the cast does not have \(roles: hero\)/);
  assert.throws(() => readCast({hero: {dress: 'red'}}), /cast.hero.name is the name/);
  assert.throws(() => withCast({n: 'Hi {{hero}}'}, null, 'storyboard'), /storyboard.n names \{\{hero\}\}.*no cast given/);
  assert.deepEqual(withCast({a: ['plain', 3]}, null), {a: ['plain', 3]}, 'without {{…}} nothing changes');
});

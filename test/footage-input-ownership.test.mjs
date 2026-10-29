// A recording changes the pieces that show it, including a replayed or camera-held earlier world.
// These tests exercise the engine-owned ledger and the existing segment material; no decoder is needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {compileFilm, evenTimings} from '../src/index.mjs';
import {approveFilm, checkApproval} from '../src/approval.mjs';
import {segmentMaterial, segmentKey} from '../src/segments/material.mjs';
import {tempDir} from './tmp.mjs';

const pixels = {width: 320, height: 180, fps: 10, layout: null, stamp: null, motionBlur: null, poster: null};
const drawing = {core: 'fixed-engine', catalog: name => `fixed-${name}`};
const recipe = {stages: ['first', 'second', 'third'].map(scene => ({type: 'world', scene, world: {kit: 'local', file: `${scene}.bin`}}))};
const options = {recipe, pixels, fps: 10, drawing};
const piece = (from, to, paths) => ({index: 1, from, to, f0: Math.round(from * 10), f1: Math.round(to * 10), paths});
const third = piece(22, 23, ['stages[2]']);
const fixture = (owners = true) => ({
  rows: [0, 1, 2].map(i => ({from: i * 10, to: (i + 1) * 10, paths: [`stages[${i}]`]})),
  timings: {scenes: []}, clock: {offsets: []}, beats: [],
  inputs: {files: {'first.bin': '1111111111111111', 'second.bin': '2222222222222222', 'third.bin': '3333333333333333'}},
  ...(owners ? {fileOwners: {'first.bin': ['stages[0]'], 'second.bin': ['stages[1]'], 'third.bin': ['stages[2]']}} : {}),
});
const filesOf = (film, seg = third, overrides = {}) => segmentMaterial(film, seg, {...options, ...overrides}).files;
const changed = (film, file) => ({...film, inputs: {...film.inputs, files: {...film.inputs.files, [file]: 'edited'}}});

test('legacy file inputs keep the complete file material, without opting into owner filtering', () => {
  const film = fixture(false);
  assert.deepEqual(filesOf(film), film.inputs.files);
  // Measured from the unmodified material module at 872fe3d with these fixed inputs and drawing fingerprint.
  assert.equal(segmentKey(film, third, options), '9784aad0a4c7a64e45213b29');
  assert.deepEqual(segmentMaterial({...film, fileOwners: {}}, third, options), segmentMaterial(film, third, options));
  assert.notEqual(segmentKey(changed(film, 'first.bin'), third, options), segmentKey(film, third, options),
    'an existing global input still affects every piece');
});

test('an edited take invalidates its own pieces while the full approval inputs remain intact', () => {
  const film = fixture(), edited = changed(film, 'first.bin');
  assert.deepEqual(filesOf(film), {'third.bin': '3333333333333333'});
  assert.equal(segmentKey(film, third, options), segmentKey(edited, third, options));
  const first = piece(2, 3, ['stages[0]']);
  assert.notEqual(segmentKey(film, first, options), segmentKey(edited, first, options));
  assert.deepEqual(Object.keys(edited.inputs.files), ['first.bin', 'second.bin', 'third.bin'],
    'filtering material must not delete an unrelated file from the full approval inputs');
});

test('a shared recording affects both owners, and a global file stays global beside scoped files', () => {
  const film = fixture();
  film.inputs.files['shared.bin'] = '4444444444444444';
  film.fileOwners['shared.bin'] = ['stages[0]', 'stages[1]'];
  film.inputs.files['global.bin'] = '5555555555555555';
  const edited = changed(film, 'shared.bin');
  for (const [from, owner] of [[2, 0], [12, 1]]) {
    const seg = piece(from, from + 1, [`stages[${owner}]`]);
    assert.notEqual(segmentKey(film, seg, options), segmentKey(edited, seg, options));
  }
  assert.equal(segmentKey(film, third, options), segmentKey(edited, third, options));
  assert.equal(filesOf(film)['global.bin'], '5555555555555555');
  assert.notEqual(segmentKey(film, third, options), segmentKey(changed(film, 'global.bin'), third, options));
});

test('filenames matching Object properties remain ordinary global or scoped inputs', () => {
  const names = ['toString', 'constructor', '__proto__'];
  for (const name of names) {
    const film = fixture();
    film.inputs.files = Object.fromEntries([...Object.entries(film.inputs.files), [name, '7777777777777777']]);
    assert.equal(filesOf(film)[name], '7777777777777777', `${name}: an unowned file is global`);
    assert.notEqual(segmentKey(film, third, options), segmentKey(changed(film, name), third, options));
    film.fileOwners = Object.fromEntries([...Object.entries(film.fileOwners), [name, ['stages[0]']]]);
    assert.equal(Object.hasOwn(filesOf(film), name), false, `${name}: the explicit owner is respected`);
    assert.equal(segmentKey(film, third, options), segmentKey(changed(film, name), third, options));
    assert.equal(filesOf(film, piece(2, 3, ['stages[0]']))[name], '7777777777777777');
  }
});

test('a replay wholly inside an earlier row includes that recording even without a transition', () => {
  const film = fixture(), seg = {...third, replays: [{from: 3, to: 4}]};
  assert.deepEqual(filesOf(film, seg), {'first.bin': '1111111111111111', 'third.bin': '3333333333333333'});
  assert.notEqual(segmentKey(film, seg, options), segmentKey(changed(film, 'first.bin'), seg, options));
});

test('camera-held pictures include the recording at picture time rather than only the current row', () => {
  const film = {...fixture(), camera: {motion: 'moves', moves: []}, pictureAt: () => 4};
  assert.deepEqual(filesOf(film), {'first.bin': '1111111111111111', 'third.bin': '3333333333333333'});
  assert.notEqual(segmentKey(film, third, options), segmentKey(changed(film, 'first.bin'), third, options));
});

test('a transition includes both incoming and outgoing media', () => {
  const film = fixture();
  film.rows[1].enter = {type: 'fade', seconds: 1};
  const seg = piece(10.2, 10.8, ['stages[1]']);
  assert.deepEqual(filesOf(film, seg), {'first.bin': '1111111111111111', 'second.bin': '2222222222222222'});
  assert.notEqual(segmentKey(film, seg, options), segmentKey(changed(film, 'first.bin'), seg, options));
});

test('a blur sample reaching the next entrance includes its recording before the nominal cut', () => {
  const film = fixture();
  film.rows[0].to = 9.94;
  film.rows[1].from = 9.94;
  film.rows[1].enter = {type: 'fade', seconds: .5};
  const seg = piece(9.9, 10, ['stages[0]']);
  assert.deepEqual(filesOf(film, seg), {'first.bin': '1111111111111111'});
  const blurred = {...options, pixels: {...pixels, motionBlur: {subframes: 2}}};
  assert.equal(segmentMaterial(film, seg, blurred).files['second.bin'], '2222222222222222');
  assert.notEqual(segmentKey(film, seg, blurred), segmentKey(changed(film, 'second.bin'), seg, blurred));
});

test('an overlay owner is included even when it is not one of the piece row paths', () => {
  const film = fixture();
  film.inputs.files['overlay.bin'] = '6666666666666666';
  film.fileOwners['overlay.bin'] = ['guesses[0]'];
  film.overlays = [{from: 21, to: 24, path: 'guesses[0]'}];
  assert.equal(filesOf(film)['overlay.bin'], '6666666666666666');
});

const board = {scenes: [{id: 'opening', silent: [['Opening', 4]]}, {id: 'later', silent: [['Later', 4]]}]};
const localRecipe = global => ({story: {kit: 'local', file: 'first.bin', global},
  stages: [{type: 'world', scene: 'later', enter: 'cut', world: {kit: 'local', file: 'second.bin'}}]});
const localKit = {name: 'local', story: {context: true, compile: (spec, context) => {
  if (spec.global === true) context.readFile(spec.file);
  return {hang: 1, draw: () => {}, ready: context.fileInput(spec.file, {maxBytes: 100}).then(() => {
    if (spec.global === 'after') context.readFile(spec.file);
  })};
}}};
const compiled = (root, global = false) => compileFilm({storyboard: board, timings: evenTimings(board, {tail: 0}),
  recipe: localRecipe(global), root, kits: [localKit]});

test('the actual engine awaits file inputs, freezes canonical owners and keeps full hashes for approval', async t => {
  const root = tempDir('footage-owners', t);
  writeFileSync(path.join(root, 'first.bin'), 'first');
  writeFileSync(path.join(root, 'second.bin'), 'second');
  const film = await compiled(root);
  assert.deepEqual(film.fileOwners, {'first.bin': ['story'], 'second.bin': ['stages[0]']});
  assert(Object.isFrozen(film.fileOwners));
  assert(Object.isFrozen(film.fileOwners['first.bin']));
  assert.deepEqual(Object.keys(film.inputs.files).sort(), ['first.bin', 'second.bin']);
  for (const hash of Object.values(film.inputs.files)) assert.match(hash, /^[a-f0-9]{16}$/);
  // A synthetic approval exercises the real admission contract, without claiming a human watched this fixture.
  const approval = approveFilm({record: {inputs: film.inputs}, by: 'fixture reviewer', at: new Date('2026-10-01T00:00:00Z')});
  assert.deepEqual(checkApproval(approval, film.inputs), {ok: true, changed: []});
  writeFileSync(path.join(root, 'first.bin'), 'new first');
  const edited = await compiled(root);
  assert.notEqual(film.inputs.files['first.bin'], edited.inputs.files['first.bin']);
  assert.equal(film.inputs.files['second.bin'], edited.inputs.files['second.bin']);
  const later = piece(5, 6, ['stages[0]']), materialOptions = {...options, recipe: localRecipe(false)};
  assert.equal(segmentKey(film, later, materialOptions), segmentKey(edited, later, materialOptions),
    'the unrelated later piece is reusable');
  assert.deepEqual(checkApproval(approval, edited.inputs), {ok: false, changed: ['the file first.bin']},
    'full approval still refuses the changed earlier take');
});

test('one actual legacy read makes a file global even when the same world also scopes it', async t => {
  const root = tempDir('footage-global', t);
  writeFileSync(path.join(root, 'first.bin'), 'first');
  writeFileSync(path.join(root, 'second.bin'), 'second');
  for (const order of [true, 'after']) {
    const film = await compiled(root, order);
    assert.equal(Object.hasOwn(film.fileOwners, 'first.bin'), false);
    assert.deepEqual(film.fileOwners['second.bin'], ['stages[0]']);
    assert.equal(Object.hasOwn(film.inputs.files, 'first.bin'), true);
  }
});

test('one actual recording shared by two worlds keeps both canonical owners', async t => {
  const root = tempDir('footage-shared', t);
  writeFileSync(path.join(root, 'first.bin'), 'first');
  const recipe = localRecipe(false);
  recipe.stages[0].world.file = 'first.bin';
  const film = await compileFilm({storyboard: board, timings: evenTimings(board, {tail: 0}), recipe, root, kits: [localKit]});
  assert.deepEqual([...film.fileOwners['first.bin']].sort(), ['stages[0]', 'story']);
  assert(Object.isFrozen(film.fileOwners['first.bin']));
  assert.deepEqual(Object.keys(film.inputs.files), ['first.bin']);
});

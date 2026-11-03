import { join } from 'node:path';
import { RUN, check, fileLooksWritten, readJson, step } from './lib.mjs';

const NAME = 'stonecut_selftest_sword';
const DISPLAY = {
  firstperson_righthand: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: [0.68, 0.68, 0.68] },
  thirdperson_righthand: { rotation: [0, -90, 55], translation: [0, 4, 0.5], scale: [0.85, 0.85, 0.85] },
  gui: { rotation: [0, 0, -45], scale: [0.6, 0.6, 0.6] },
};
const SIDES = { north: [0, 0, 1, 5], south: [0, 0, 1, 5], east: [0, 0, 1, 5], west: [0, 0, 1, 5], up: null, down: [0, 0, 1, 1] };

async function build(client) {
  await step(client, 'new_java_item with display', 'new_java_item', { name: NAME, texture_width: 32, display: DISPLAY, namespace: 'stonecut_test' });
  await step(client, 'add_cubes without bones, with faces', 'add_cubes', { cubes: [
    { name: 'grip', from: [7.5, 0, 7.5], to: [8.5, 5, 8.5], faces: SIDES },
    { name: 'guard', from: [6, 5, 7.5], to: [10, 6, 8.5] },
    { name: 'blade', from: [7.5, 6, 7.75], to: [8.5, 20, 8.25] },
  ] });
  await step(client, 'texture_create 32', 'texture_create', { width: 32, height: 32, fill: '#8a8f99' });
  await step(client, 'texture_fill_rect grip', 'texture_fill_rect', { x: 0, y: 0, w: 1, h: 5, color: '#4a2d1a' });
}

async function display(client) {
  const got = (await step(client, 'display_get', 'display_get')).result.display ?? {};
  check('display_get returns what new_java_item set', got.firstperson_righthand?.rotation?.join() === '0,-90,25', got);
  await step(client, 'display_set one slot', 'display_set', { slot: 'thirdperson_righthand', translation: [0, 5, 0.5] });
  const one = (await step(client, 'display_get one slot', 'display_get', { slot: 'thirdperson_righthand' })).result.display ?? {};
  const slot = one.thirdperson_righthand ?? {};
  check('display_set kept rotation, changed translation', slot.rotation?.join() === '0,-90,55' && slot.translation?.join() === '0,5,0.5', slot);
}

async function shoot(client) {
  const slots = ['firstperson_righthand', 'thirdperson_righthand', 'gui'];
  const shots = await step(client, 'display_screenshot 3 slots', 'display_screenshot', { slots });
  check('3 display images come back', shots.images.length === 3, shots.result);
  for (const f of shots.result.files ?? []) fileLooksWritten('display screenshot', f.path);
  await step(client, 'plain screenshot of a Java model', 'screenshot', { views: ['front', 'iso'] });
}

async function exportAndReopen(client, output) {
  const files = { model: `output:selftest/${RUN}/${NAME}.json`, texture: `output:selftest/${RUN}/${NAME}.png` };
  const exp = (await step(client, 'export model + texture', 'export', files)).result;
  check('export wrote 2 files', exp.written?.length === 2, exp);
  const model = readJson(join(output, 'selftest', RUN, `${NAME}.json`));
  check('exported model has 3 elements', model.elements?.length === 3, model.elements);
  check('exported texture link uses the namespace', Object.values(model.textures ?? {}).some((v) => String(v).startsWith('stonecut_test:item/')), model.textures);
  const opened = (await step(client, 'open_java_model the export', 'open_java_model', { ...files, reopen: true })).result;
  check('reopened: 3 elements', opened.element_count === 3, opened);
  check('reopened: gui display survived', opened.display?.gui?.rotation?.join() === '0,0,-45', opened.display);
}

async function openFixture(client, fixtures) {
  const opened = (await step(client, 'open_java_model the plain sword fixture', 'open_java_model', { model: `${fixtures}plain_sword.json`, reopen: true })).result;
  check('plain sword: 3 elements', opened.element_count === 3, opened);
}

export async function javaTest(client, output, fixtures) {
  await build(client);
  await display(client);
  await shoot(client);
  await exportAndReopen(client, output);
  await openFixture(client, fixtures);
}

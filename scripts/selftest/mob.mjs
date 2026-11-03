import { join } from 'node:path';
import { RUN, check, fileLooksWritten, readJson, step } from './lib.mjs';

const NAME = 'stonecut_selftest_mob';

async function build(client) {
  await step(client, 'new_project', 'new_project', { name: NAME, texture_width: 64, texture_height: 64 });
  await step(client, 'add_bones', 'add_bones', { bones: [
    { name: 'body', pivot: [0, 0, 0] },
    { name: 'head', parent: 'body', pivot: [0, 8, -2] },
  ] });
  await step(client, 'add_cubes (origin + size, from + to)', 'add_cubes', { cubes: [
    { bone: 'body', origin: [-4, 0, -4], size: [8, 8, 8], uv_offset: [0, 0] },
    { bone: 'head', from: [-3, 8, -5], to: [3, 14, 1], uv_offset: [0, 16] },
    { bone: 'head', name: 'snout', from: [-1, 9, -7], to: [1, 11, -5], uv_offset: [24, 16], inflate: 0.1 },
  ] });
}

async function paint(client) {
  await step(client, 'texture_create 64x64', 'texture_create', { width: 64, height: 64, fill: '#3a7d44' });
  await step(client, 'texture_fill_rect', 'texture_fill_rect', { x: 0, y: 16, w: 24, h: 12, color: '#6dbb5a' });
  await step(client, 'texture_draw (eyes)', 'texture_draw', {
    x: 6, y: 22, palette: { w: '#ffffff', k: '#000000' }, rows: ['......', '.wk.kw', '......'],
  });
  await step(client, 'texture_set_pixels', 'texture_set_pixels', { pixels: [[9, 26, '#aa3333'], [10, 26, '#aa3333']] });
}

async function animate(client) {
  await step(client, 'add_animation idle', 'add_animation', { name: 'idle', loop: true, length: 2 });
  await step(client, 'add_keyframes', 'add_keyframes', { animation: 'idle', interpolation: 'catmullrom', tracks: [
    { bone: 'head', channel: 'rotation', keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 25, 0] }, { time: 2, value: [0, 0, 0] }] },
    { bone: 'body', channel: 'position', keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [0, 1, 0] }, { time: 2, value: 0 }] },
  ] });
}

async function shoot(client) {
  const status = (await step(client, 'status after build', 'status')).result;
  const project = status.project ?? {};
  check('2 bones and 3 cubes', project.bones?.length === 2 && project.cube_count === 3, project);
  const still = await step(client, 'screenshot iso + front', 'screenshot', { views: ['iso', 'front'] });
  const posed = await step(client, 'screenshot mid-animation', 'screenshot', { view: 'right', animation: 'idle', time: 1 });
  check('screenshots come back as images', still.images.length === 2 && posed.images.length === 1);
  for (const f of [...(still.result.files ?? []), ...(posed.result.files ?? [])]) fileLooksWritten('screenshot file', f.path);
}

async function exportAndRead(client, output) {
  const dir = `output:selftest/${RUN}`;
  const files = { geo: `${dir}/${NAME}.geo.json`, animation: `${dir}/${NAME}.animation.json`, texture: `${dir}/${NAME}.png` };
  const exp = (await step(client, 'export geo + animation + texture', 'export', files)).result;
  check('export wrote 3 files', exp.written?.length === 3, exp);
  const geo = readJson(join(output, 'selftest', RUN, `${NAME}.geo.json`));
  const bones = (geo['minecraft:geometry']?.[0]?.bones ?? []).map((b) => b.name);
  check('geo.json has bones body + head', bones.join() === 'body,head', bones);
  const anim = readJson(join(output, 'selftest', RUN, `${NAME}.animation.json`));
  check('animation.json has idle', Object.keys(anim.animations ?? {}).some((k) => k.endsWith('idle')), anim);
}

async function openFixture(client, fixtures) {
  const args = { geo: `${fixtures}cube_mob.geo.json`, animation: `${fixtures}cube_mob.animation.json` };
  const opened = (await step(client, 'open_model the cube mob fixture', 'open_model', { ...args, reopen: true })).result;
  check('cube mob: 3 bones, 2 cubes', opened.bones === 3 && opened.cubes === 2, opened);
  const again = (await step(client, 'open_model again switches to that tab', 'open_model', args)).result;
  check('second open says already_open', again.already_open === true, again);
}

export async function mobTest(client, output, fixtures) {
  await build(client);
  await paint(client);
  await animate(client);
  await shoot(client);
  await exportAndRead(client, output);
  await openFixture(client, fixtures);
}

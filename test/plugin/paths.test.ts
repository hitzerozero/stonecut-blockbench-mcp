import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import { expect, it } from 'vitest';
import { loadPlugin } from '../helpers/sandbox.js';
import { tempDir } from '../helpers/temp.js';

const NAMES = ['checkPath', 'writeOut', 'roots', 'loadToken', 'javaTextureLoader'];
const BLANK_DOCUMENT = { createElement: () => ({ toDataURL: () => 'data:blank' }) };
// PNG signature and the start of an IHDR chunk for a 16 x 16 image: enough for the plugin's checks.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 16, 0, 0, 0, 16]);

function withFolders(assets = true, globals: Record<string, unknown> = {}) {
  const output = tempDir('output');
  const assetsDir = tempDir('assets');
  const box = loadPlugin(NAMES, { settings: { output_folder: output, assets_folder: assets ? assetsDir : '' }, globals });
  return { ...box, output, assets: assetsDir };
}

it('defaults the output folder to stonecut-blockbench in the home folder', () => {
  const box = loadPlugin(NAMES, { settings: { output_folder: 'relative/folder' } });
  expect(box.fn.roots()).toEqual({ output: join(box.home, 'stonecut-blockbench') });
});

it('resolves output: and assets: prefixes inside their folders', () => {
  const { fn, output, assets, scopes, home } = withFolders();
  expect(fn.checkPath('output:shots/a.png', ['.png']).full).toBe(join(output, 'shots', 'a.png'));
  expect(fn.checkPath('assets:geo/mob.geo.json', ['.json']).full).toBe(join(assets, 'geo', 'mob.geo.json'));
  expect(fn.checkPath(join(output, 'b.png'), ['.png']).full).toBe(join(output, 'b.png'));
  expect(new Set(scopes)).toEqual(new Set([join(home, '.stonecut_blockbench_config.json'), output, assets]));
});

it('refuses paths that leave the allowed folders', () => {
  const { fn, output } = withFolders();
  expect(() => fn.checkPath('output:../escape.png', ['.png'])).toThrow('Path not allowed');
  expect(() => fn.checkPath(join(parse(output).root, 'elsewhere', 'x.png'), ['.png'])).toThrow('Path not allowed');
  expect(() => fn.checkPath('output:', ['.png'])).toThrow('Path not allowed');
  expect(() => fn.checkPath('shots/a.png', ['.png'])).toThrow('absolute path');
  expect(() => fn.checkPath('output:a.png:stream', ['.png'])).toThrow('may not contain ":"');
  expect(() => fn.checkPath('output:a.txt', ['.png'])).toThrow('must end with .png');
});

it('refuses assets: while no assets folder is set', () => {
  const { fn } = withFolders(false);
  expect(() => fn.checkPath('assets:geo/mob.geo.json', ['.json'])).toThrow('assets folder is not set');
});

it('writes into new subfolders and keeps existing files unless told to overwrite', () => {
  const { fn, output } = withFolders();
  const target = fn.checkPath('output:deep/er/file.json', ['.json']);
  expect(fn.writeOut(target, 'one', false)).toBe(join(output, 'deep', 'er', 'file.json'));
  expect(() => fn.writeOut(target, 'two', false)).toThrow('File exists');
  fn.writeOut(target, 'three', true);
  expect(readFileSync(target.full, 'utf8')).toBe('three');
});

it('writes a new 64 hex token to the home folder at every start', () => {
  const { fn, home } = withFolders();
  const token = fn.loadToken();
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  expect(readFileSync(join(home, '.stonecut_blockbench_token'), 'utf8').trim()).toBe(token);
  const next = fn.loadToken();
  expect(next).toMatch(/^[0-9a-f]{64}$/);
  expect(next).not.toBe(token);
  expect(readFileSync(join(home, '.stonecut_blockbench_token'), 'utf8').trim()).toBe(next);
});

it('feeds Java textures only from allowed files and answers mcmeta itself', () => {
  const { fn, output, assets } = withFolders(true, { document: BLANK_DOCUMENT });
  mkdirSync(join(assets, 'textures', 'item'), { recursive: true });
  writeFileSync(join(output, 'sword.png'), PNG);
  writeFileSync(join(assets, 'textures', 'item', 'gem.png'), PNG);
  const load = fn.javaTextureLoader({ full: join(output, 'sword.json') }, null);
  expect(load('C:\\pack\\textures\\item\\sword.png.mcmeta')).toBe('{}');
  expect(Buffer.compare(load('/pack/textures/item/sword.png'), PNG)).toBe(0);
  expect(Buffer.compare(load('/pack/textures/item/gem.png'), PNG)).toBe(0);
  expect(load('/pack/models/item/sword.json')).toBe('data:blank');
});

it('shows a blank texture for a PNG outside the allowed folders, even when it exists', () => {
  const { fn, output } = withFolders(true, { document: BLANK_DOCUMENT });
  const secret = join(tempDir('secret'), 'textures');
  mkdirSync(secret, { recursive: true });
  writeFileSync(join(secret, 'key.png'), PNG);
  const load = fn.javaTextureLoader({ full: join(output, 'sword.json') }, null);
  expect(load(join(secret, 'key.png'))).toBe('data:blank');
});

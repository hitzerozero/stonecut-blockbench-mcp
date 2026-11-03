import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, expect, it } from 'vitest';
import { initSettings, showSettings } from '../src/cli.js';
import { DEFAULT_SETTINGS, parseSettings, readSettings, SETTINGS_FILE_NAME } from '../src/settings.js';
import { ok, startFakeBridge, type FakeBridge, type Handler } from './helpers/fake-bridge.js';
import { call, callError, connectClient } from './helpers/mcp-client.js';
import { tempDir } from './helpers/temp.js';

const HOME = resolve('home', 'someone');
const FILE = join(HOME, SETTINGS_FILE_NAME);
const parse = (value: unknown) => parseSettings(JSON.stringify(value), FILE, HOME);

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function clientWithSettings(settings: unknown, handlers: Record<string, Handler> = {}): Promise<Client> {
  const home = tempDir('settings-home');
  const file = join(home, SETTINGS_FILE_NAME);
  writeFileSync(file, typeof settings === 'string' ? settings : JSON.stringify(settings));
  fake = await startFakeBridge(handlers);
  return connectClient(fake, () => readSettings(file, home));
}

it('uses the defaults when there is no settings file', async () => {
  const loaded = await readSettings(join(tempDir('no-settings'), SETTINGS_FILE_NAME), HOME);
  expect(loaded.found).toBe(false);
  expect(loaded.values).toEqual(DEFAULT_SETTINGS);
  expect(DEFAULT_SETTINGS).toEqual({
    output_folder: '', assets_folder: '', allow_export: true,
    max_texture_size: 4096, max_file_mb: 16, max_cubes: 4096, confirm: 'overwrite_and_close',
  });
});

it('ships a config.example.json that holds exactly the defaults', () => {
  const example = readFileSync(new URL('../config.example.json', import.meta.url), 'utf8');
  expect(parseSettings(example, 'config.example.json', HOME)).toEqual(DEFAULT_SETTINGS);
  expect(Object.keys(JSON.parse(example))).toEqual(Object.keys(DEFAULT_SETTINGS));
});

it('reads every setting and expands ~ to the home folder', () => {
  const s = parse({
    output_folder: '~/models', assets_folder: ' ~ ', allow_export: false,
    max_texture_size: 256, max_file_mb: 4, max_cubes: 100, confirm: 'every_change',
  });
  expect(s).toMatchObject({ allow_export: false, max_texture_size: 256, max_file_mb: 4, max_cubes: 100, confirm: 'every_change' });
  expect(s.output_folder.endsWith(join('home', 'someone', 'models'))).toBe(true);
  expect(s.assets_folder.endsWith(join('home', 'someone'))).toBe(true);
});

it('refuses any attempt to change where the bridge listens', () => {
  for (const key of ['host', 'bind', 'address', 'listen']) {
    expect(() => parse({ [key]: '0.0.0.0' })).toThrow('always listens on 127.0.0.1');
  }
});

it('refuses unknown settings, bad values and broken JSON', () => {
  expect(() => parse({ alow_export: false })).toThrow(/alow_export/);
  expect(() => parse({ max_texture_size: 8192 })).toThrow(/max_texture_size/);
  expect(() => parse({ max_file_mb: 0 })).toThrow(/max_file_mb/);
  expect(() => parse({ confirm: 'sometimes' })).toThrow(/confirm/);
  expect(() => parse({ allow_export: 'no' })).toThrow(/allow_export/);
  expect(() => parse({ output_folder: 'relative/folder' })).toThrow(/full folder path/);
  expect(() => parseSettings('{oops', FILE, HOME)).toThrow(/not valid JSON/);
  expect(() => parseSettings('[1]', FILE, HOME)).toThrow(/bad value/);
});

it('refuses export before Blockbench sees it when export is turned off', async () => {
  const client = await clientWithSettings({ allow_export: false }, { export: () => ok({ written: [], format: 'x' }) });
  expect(await callError(client, 'export', { geo: 'output:mob.geo.json' })).toMatch(/Export is turned off/);
  expect(fake!.requests).toHaveLength(0);
});

it('refuses textures larger than max_texture_size and too many cubes at once', async () => {
  const client = await clientWithSettings({ max_texture_size: 64, max_cubes: 2 }, {
    texture_create: () => ok({ size: [64, 64], kept_old_pixels: false, texture_uv_size: [64, 64] }),
  });
  expect(await callError(client, 'texture_create', { width: 128 })).toMatch(/texture size limit 64/);
  expect(await callError(client, 'new_project', { name: 'mob', texture_width: 64, texture_height: 128 })).toMatch(/texture_height 128/);
  const cube = { bone: 'body', from: [0, 0, 0], to: [1, 1, 1] };
  expect(await callError(client, 'add_cubes', { cubes: [cube, cube, cube] })).toMatch(/limit of 2/);
  expect(fake!.requests).toHaveLength(0);
  expect((await call(client, 'texture_create', { width: 64 })).isError).toBeFalsy();
  expect(fake!.requests).toHaveLength(1);
});

it('refuses every tool while the settings file is broken', async () => {
  const client = await clientWithSettings('{ "max_cubes": "lots" }', { ping: () => ok({ pong: true, version: '1.0.0' }) });
  expect(await callError(client, 'ping', {})).toMatch(/max_cubes/);
  expect(fake!.requests).toHaveLength(0);
});

it('creates the settings file with the defaults once and shows it', () => {
  const home = tempDir('init-home');
  const file = join(home, SETTINGS_FILE_NAME);
  expect(showSettings(file, home)).toMatch(/No settings file yet/);
  expect(initSettings(file)).toMatch(/^Created/);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(DEFAULT_SETTINGS);
  writeFileSync(file, '{ "allow_export": false }');
  expect(initSettings(file)).toMatch(/already exists/);
  expect(showSettings(file, home)).toMatch(/"allow_export": false/);
});

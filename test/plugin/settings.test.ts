import { request } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../../src/settings.js';
import { freePort } from '../helpers/fake-bridge.js';
import { loadPlugin } from '../helpers/sandbox.js';
import { tempDir } from '../helpers/temp.js';

const NAMES = [
  'CONFIG_DEFAULTS', 'parseConfig', 'conf', 'roots', 'checkPath', 'writeOut', 'readJsonFile', 'readPngBytes',
  'endpoints', 'confirmReason', 'confirmIfNeeded', 'startServer', 'stopServer', 'state',
];
const CONFIG = '.stonecut_blockbench_config.json';

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function pluginWith(settings: unknown, options: { output?: string; globals?: Record<string, unknown> } = {}) {
  const home = tempDir('home');
  const output = options.output ?? tempDir('output');
  if (settings !== undefined) writeFileSync(join(home, CONFIG), typeof settings === 'string' ? settings : JSON.stringify(settings));
  const box = loadPlugin(NAMES, { home, settings: { output_folder: output }, globals: options.globals });
  return { ...box, output };
}

it('has the same defaults as the MCP server', () => {
  const { fn } = pluginWith(undefined);
  expect({ ...fn.CONFIG_DEFAULTS }).toEqual(DEFAULT_SETTINGS);
  expect({ ...fn.conf() }).toEqual(DEFAULT_SETTINGS);
});

it('reads a settings file the same way the MCP server does', () => {
  const { fn, home } = pluginWith(undefined);
  const file = join(home, CONFIG);
  const good = ['{}', '{"max_file_mb": 32, "confirm": "never", "allow_export": false}', '{"output_folder": "~/models", "max_cubes": 10}'];
  for (const text of good) expect({ ...fn.parseConfig(text, file) }).toEqual(parseSettings(text, file, home));
  const bad = ['{"host": "0.0.0.0"}', '{"nope": 1}', '{"max_texture_size": 8192}', '{"confirm": "sometimes"}',
    '{"output_folder": "relative"}', '{"max_file_mb": 1.5}', '[1]', '{oops'];
  for (const text of bad) {
    expect(() => fn.parseConfig(text, file), text).toThrow(file);
    expect(() => parseSettings(text, file, home), text).toThrow(file);
  }
});

it('lets the settings file choose the folders over the Blockbench settings', () => {
  const chosen = tempDir('chosen');
  const { fn, output } = pluginWith({ output_folder: chosen, assets_folder: '~/pack' });
  expect(fn.roots()).toEqual({ output: chosen, assets: join(fn.conf().assets_folder) });
  expect(fn.roots().output).not.toBe(output);
  expect(() => fn.checkPath(join(output, 'a.png'), ['.png'])).toThrow('Path not allowed');
});

it('never lets a tool read or write the settings file or the token, even when the output folder is the home folder', () => {
  const home = tempDir('home');
  const { fn } = loadPlugin(NAMES, { home, settings: { output_folder: home } });
  expect(() => fn.checkPath(`output:${CONFIG}`, ['.json'])).toThrow('belongs to the bridge');
  expect(() => fn.checkPath('output:.stonecut_blockbench_token', null)).toThrow('belongs to the bridge');
  expect(fn.checkPath('output:other.json', ['.json']).full).toBe(join(home, 'other.json'));
});

it('refuses to write or read files over max_file_mb', () => {
  const { fn, output } = pluginWith({ max_file_mb: 1 });
  const big = Buffer.alloc(1024 * 1024 + 1);
  expect(() => fn.writeOut(fn.checkPath('output:big.png', ['.png']), big, false)).toThrow('over the 1 MB limit');
  fn.writeOut(fn.checkPath('output:small.png', ['.png']), Buffer.alloc(10), false);
  writeFileSync(join(output, 'big.json'), `"${'x'.repeat(1024 * 1024)}"`);
  expect(() => fn.readJsonFile('output:big.json')).toThrow('over the 1 MB limit');
});

it('refuses PNG textures wider or taller than max_texture_size', () => {
  const { fn, output } = pluginWith({ max_texture_size: 64 });
  writeFileSync(join(output, 'ok.png'), png(64, 64));
  writeFileSync(join(output, 'tall.png'), png(64, 128));
  expect(fn.readPngBytes(fn.checkPath('output:ok.png', ['.png'])).length).toBe(24);
  expect(() => fn.readPngBytes(fn.checkPath('output:tall.png', ['.png']))).toThrow('PNG height 128');
});

it('refuses export when allow_export is false', () => {
  const { fn } = pluginWith({ allow_export: false }, { globals: { Project: {} } });
  expect(() => fn.endpoints.export({ geo: 'output:mob.geo.json' })).toThrow('Export is turned off');
});

it('asks before replacing a file or closing a tab, and only then, by default', () => {
  const { fn, output } = pluginWith(undefined);
  mkdirSync(join(output, 'shots'));
  writeFileSync(join(output, 'shots', 'old.png'), png(16, 16));
  const mode = 'overwrite_and_close';
  expect(fn.confirmReason('export', { texture: 'output:shots/old.png', overwrite: true }, mode)).toBe(`replace \`${join(output, 'shots', 'old.png')}\``);
  expect(fn.confirmReason('export', { texture: 'output:shots/new.png', overwrite: true }, mode)).toBeNull();
  expect(fn.confirmReason('export', { texture: 'output:shots/old.png' }, mode)).toBeNull();
  expect(fn.confirmReason('screenshot', { path: 'output:shots/old.png', overwrite: true }, mode)).toMatch(/^replace /);
  expect(fn.confirmReason('close_tab', { duplicates: true }, mode)).toBe('close unedited duplicate tabs');
  expect(fn.confirmReason('add_cubes', { cubes: [] }, mode)).toBeNull();
});

it('asks before every change with every_change, and never with never', () => {
  const { fn } = pluginWith(undefined);
  expect(fn.confirmReason('add_cubes', {}, 'every_change')).toBe('run `add_cubes`');
  expect(fn.confirmReason('export', { geo: 'output:a.geo.json' }, 'every_change')).toBe('run `export`');
  expect(fn.confirmReason('screenshot', {}, 'every_change')).toBeNull();
  expect(fn.confirmReason('status', {}, 'every_change')).toBeNull();
  expect(fn.confirmReason('close_tab', { duplicates: true }, 'never')).toBeNull();
});

it('goes ahead when the person clicks Allow and refuses when they click Deny', async () => {
  let answer = 0;
  const messages: string[] = [];
  const Blockbench = { showMessageBox: (o: { message: string }, cb: (b: number) => void) => { messages.push(o.message); setTimeout(() => cb(answer), 0); } };
  const { fn } = pluginWith(undefined, { globals: { Blockbench } });
  await fn.confirmIfNeeded('close_tab', { duplicates: true }, { confirm: 'overwrite_and_close' });
  answer = 1;
  await expect(fn.confirmIfNeeded('close_tab', { duplicates: true }, { confirm: 'overwrite_and_close' })).rejects.toThrow('did not allow');
  expect(messages[0]).toMatch(/asks to close unedited duplicate tabs/);
});

function post(port: number, path: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', 'X-Stonecut-Token': token };
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers, agent: false }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end('{"duplicates": true}');
  });
}

it('refuses a request over HTTP when the person denies it, before the endpoint runs', async () => {
  const port = await freePort();
  const Blockbench = { showQuickMessage: () => undefined, showMessageBox: (_o: unknown, cb: (b: number) => void) => setTimeout(() => cb(1), 0) };
  const home = tempDir('home');
  const box = loadPlugin(NAMES, { home, settings: { port }, globals: { Blockbench } });
  box.fn.endpoints.close_tab = () => { throw new Error('the endpoint ran'); };
  box.fn.startServer();
  try {
    for (let i = 0; i < 50 && !box.fn.state.server?.listening; i++) await new Promise((r) => setTimeout(r, 20));
    const reply = await post(port, '/close_tab', box.fn.state.token);
    expect(reply.status).toBe(422);
    expect(JSON.parse(reply.body).error).toMatch(/did not allow/);
  } finally {
    box.fn.stopServer();
  }
});

it('will not start, and refuses every request, while the settings file is broken', () => {
  const { fn } = pluginWith('{ "listen": "0.0.0.0" }');
  expect(() => fn.startServer()).toThrow('always listens on 127.0.0.1');
  expect(fn.state.server).toBeNull();
  expect(() => fn.conf()).toThrow('always listens on 127.0.0.1');
});

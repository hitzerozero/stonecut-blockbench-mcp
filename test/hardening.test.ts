import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createBridge } from '../src/bridge.js';
import { findOnPath, PINNED_PACKAGE, PLUGIN_URL } from '../src/install.js';
import { pingReply } from '../src/replies.js';
import { readSettings, SETTINGS_FILE_NAME } from '../src/settings.js';
import { VERSION } from '../src/version.js';
import { ok, startFakeBridge, type FakeBridge } from './helpers/fake-bridge.js';
import { callError, connectClient } from './helpers/mcp-client.js';
import { tempDir } from './helpers/temp.js';

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

// ---- M4: the token only goes to a program that proves it already holds it ----

it('never sends the token to a program that cannot prove it holds it', async () => {
  fake = await startFakeBridge({ ping: () => ok({ pong: true, version: VERSION }) }, { impostor: true });
  const bridge = createBridge({ port: fake.port, tokenFile: fake.tokenFile, timeoutMs: 2000 });
  await expect(bridge.call('ping', {}, pingReply)).rejects.toThrow('could not prove it holds the token');
  expect(fake.requests).toHaveLength(0);
  expect(fake.hellos).toHaveLength(1);
  expect(fake.hellos[0]!.headers['x-stonecut-token']).toBeUndefined();
});

it('sends a fresh nonce for every call, and the token only after the proof', async () => {
  fake = await startFakeBridge({ ping: () => ok({ pong: true, version: VERSION }) });
  const bridge = createBridge({ port: fake.port, tokenFile: fake.tokenFile, timeoutMs: 2000 });
  await bridge.call('ping', {}, pingReply);
  await bridge.call('ping', {}, pingReply);
  const nonces = fake.hellos.map((h) => (h.body as { nonce: string }).nonce);
  expect(nonces).toHaveLength(2);
  expect(nonces[0]).toMatch(/^[0-9a-f]{64}$/);
  expect(nonces[0]).not.toBe(nonces[1]);
  expect(fake.requests.map((r) => r.headers['x-stonecut-token'])).toEqual(['ab'.repeat(32), 'ab'.repeat(32)]);
});

it('explains an older bridge that has no identity check', async () => {
  fake = await startFakeBridge({}, { noHello: true });
  const bridge = createBridge({ port: fake.port, tokenFile: fake.tokenFile, timeoutMs: 2000 });
  await expect(bridge.call('ping', {}, pingReply)).rejects.toThrow(/identity check[\s\S]*older Stonecut Bridge/);
  expect(fake.requests.map((r) => r.endpoint)).toEqual(['hello']);
  expect(fake.requests[0]!.headers['x-stonecut-token']).toBeUndefined();
});

// ---- L4, L7, L8: refused before anything reaches the bridge ----

async function client(settings: unknown = {}) {
  const home = tempDir('hard-home');
  writeFileSync(join(home, SETTINGS_FILE_NAME), JSON.stringify(settings));
  fake = await startFakeBridge({});
  return connectClient(fake, () => readSettings(join(home, SETTINGS_FILE_NAME), home));
}

it('refuses a close_tab name that is not a plain object name', async () => {
  const c = await client();
  expect(await callError(c, 'close_tab', { name: '![x](https://example.org/a.png)' })).toMatch(/1-64 characters/);
  expect(fake!.requests).toHaveLength(0);
});

it('refuses screenshot paths while export is turned off', async () => {
  const c = await client({ allow_export: false });
  expect(await callError(c, 'screenshot', { path: 'output:x.png' })).toMatch(/Leave out "path"/);
  expect(await callError(c, 'display_screenshot', { path: 'output:x.png' })).toMatch(/Leave out "path"/);
  expect(fake!.requests).toHaveLength(0);
});

it('caps the work one call can ask for', async () => {
  const c = await client();
  expect(await callError(c, 'texture_draw', { rows: Array(300).fill('a'.repeat(1000)), palette: { a: '#000000' } })).toMatch(/characters in rows/);
  expect(await callError(c, 'texture_draw', { rows: Array(64).fill('a'.repeat(100)), palette: { a: '#000000' }, scale: 64 })).toMatch(/pixels/);
  const keyframes = Array.from({ length: 1024 }, (_, i) => ({ time: i / 100, value: 0 }));
  const tracks = Array.from({ length: 5 }, () => ({ bone: 'body', keyframes }));
  expect(await callError(c, 'add_keyframes', { animation: 'walk', tracks })).toMatch(/5120 keyframes/);
  expect(await callError(c, 'add_cubes', { cubes: [{ bone: 'b', from: [5000, 0, 0], to: [5001, 1, 1] }] })).toMatch(/4096/);
  expect(await callError(c, 'add_cubes', { cubes: [{ bone: 'b', from: [0, 0, 0], to: [1, 1, 1], inflate: 20 }] })).toMatch(/16/);
  expect(await callError(c, 'add_bones', { bones: [{ name: 'b', rotation: [0, 400, 0] }] })).toMatch(/360/);
  expect(await callError(c, 'add_keyframes', { animation: 'walk', tracks: [{ bone: 'b', keyframes: [{ time: 4000, value: 0 }] }] })).toMatch(/3600/);
  expect(fake!.requests).toHaveLength(0);
});

// ---- L5: claude is found by its full path, never in the current folder ----

it('finds claude only in absolute PATH folders, never the current folder', () => {
  const win = new Set(['C:\\Tools\\claude.cmd', 'claude.bat', '.\\claude.bat', 'bin\\claude.exe']);
  const winEnv = { PATH: ['.', '', 'bin', '\\rooted', '"C:\\Tools"'].join(';'), PATHEXT: '.EXE;.BAT;.CMD' };
  expect(findOnPath('claude', winEnv, 'win32', (p) => win.has(p))).toBe('C:\\Tools\\claude.cmd');
  const posix = new Set(['/usr/local/bin/claude', 'bin/claude', './claude']);
  expect(findOnPath('claude', { PATH: ':.:bin:/usr/local/bin' }, 'linux', (p) => posix.has(p))).toBe('/usr/local/bin/claude');
  expect(findOnPath('claude', { PATH: '.:bin' }, 'linux', (p) => posix.has(p))).toBeNull();
});

// ---- M3, I1: pinned versions ----

it('pins the package, the plugin URL, the workflow actions and the dependencies', () => {
  expect(PINNED_PACKAGE).toBe(`stonecut-blockbench-mcp@${VERSION}`);
  expect(PLUGIN_URL).toBe(`https://github.com/hitzerozero/stonecut-blockbench-mcp/releases/download/v${VERSION}/stonecut_bridge.js`);
  const workflow = readFileSync(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
  const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]!);
  expect(uses.length).toBeGreaterThan(0);
  for (const u of uses) expect(u, u).toMatch(/@[0-9a-f]{40}$/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    expect(range, name).toMatch(/^\d+\.\d+\.\d+$/);
  }
});

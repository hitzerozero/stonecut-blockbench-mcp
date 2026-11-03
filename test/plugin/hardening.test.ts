import { createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect, type Socket } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freePort } from '../helpers/fake-bridge.js';
import { BLOCKBENCH_FS_SYNC, blockbenchScopedFs, loadPlugin, type Sandbox } from '../helpers/sandbox.js';
import { tempDir } from '../helpers/temp.js';

const NAMES = [
  'withoutTextureLookup', 'loadGeo',
  'javaTextureLoader', 'checkTextureRefs', 'checkPath', 'writePng', 'checkDrawWork', 'checkGeoJson', 'confirmReason',
  'endpoints', 'vec', 'num', 'LIMITS', 'startServer', 'stopServer', 'state',
];
const BLANK_DOCUMENT = { createElement: () => ({ getContext: () => ({}), toDataURL: () => 'data:blank' }) };
const CONFIG = '.stonecut_blockbench_config.json';

function plugin(settings?: unknown, globals: Record<string, unknown> = {}, output = tempDir('output')) {
  const home = tempDir('home');
  if (settings !== undefined) writeFileSync(join(home, CONFIG), JSON.stringify(settings));
  const box = loadPlugin(NAMES, { home, settings: { output_folder: output }, globals: { document: BLANK_DOCUMENT, ...globals } });
  return { ...box, output };
}

// ---- M2: Java textures never fall back to Blockbench's own, unfenced file reading ----

it('answers every image request with an allowed PNG or a blank, never with nothing', () => {
  const { fn, output } = plugin();
  const load = fn.javaTextureLoader({ full: join(output, 'sword.json') }, null);
  for (const req of ['C:\\Windows\\secret.tga', '/etc/passwd', join(output, 'a.png.'), join(output, 'a.png '), 'x.jpg', '', 'data:image/png;base64,AAAA']) {
    expect(load(req), req).toBe('data:blank');
  }
});

it('refuses Java models whose textures are file paths or data URLs', () => {
  const { fn } = plugin();
  for (const bad of ['data:image/png;base64,AAAA', '/etc/x', 'C:\\x.png', 'C:/x.png', '../../x', 'item/../../x', { sprite: '/abs.png' }]) {
    expect(() => fn.checkTextureRefs({ textures: { layer0: bad } }), JSON.stringify(bad)).toThrow('resource location');
  }
  for (const good of ['minecraft:item/iron_sword', '#layer0', 'item/sword', 'c:item/gem', { sprite: 'minecraft:block/stone' }]) {
    expect(() => fn.checkTextureRefs({ textures: { layer0: good } }), JSON.stringify(good)).not.toThrow();
  }
});

// ---- L3: links and the bridge's own files ----

it('does not follow a symbolic link or junction inside the allowed folders', () => {
  const { fn, output } = plugin();
  const outside = tempDir('outside');
  writeFileSync(join(outside, 'secret.png'), 'x');
  symlinkSync(outside, join(output, 'link'), 'junction');
  expect(() => fn.checkPath('output:link/secret.png', ['.png'])).toThrow('Links');
  expect(() => fn.checkPath('output:link/new.png', ['.png'])).toThrow('Links');
  expect(fn.checkPath('output:plain/new.png', ['.png']).full).toBe(join(output, 'plain', 'new.png'));
});

it('refuses the bridge files in any letter case and through a link', () => {
  const home = tempDir('home');
  const { fn } = loadPlugin(NAMES, { home, settings: { output_folder: home } });
  expect(() => fn.checkPath('output:.STONECUT_BLOCKBENCH_CONFIG.json', ['.json'])).toThrow('belongs to the bridge');
  mkdirSync(join(home, 'models'));
  const out2 = join(home, 'models');
  const linked = loadPlugin(NAMES, { home, settings: { output_folder: out2 } });
  symlinkSync(home, join(out2, 'up'), 'junction');
  expect(() => linked.fn.checkPath(`output:up/${CONFIG}`, ['.json'])).toThrow(/belongs to the bridge|Links/);
});

// ---- L4: names and messages ----

it('validates the close_tab name and shows values in code spans', async () => {
  const { fn, output } = plugin(undefined, { ModelProject: { all: [] } });
  await expect(fn.endpoints.close_tab({ name: '![x](https://example.org/a.png)' })).rejects.toThrow('1-64 chars');
  expect(() => fn.confirmReason('close_tab', { name: 'bad name!' }, 'overwrite_and_close')).toThrow('1-64 chars');
  expect(fn.confirmReason('close_tab', { name: 'wolf' }, 'overwrite_and_close')).toBe('close unedited duplicates of the tab `wolf`');
  writeFileSync(join(output, 'we`ird.png'), 'x');
  const reason = fn.confirmReason('export', { texture: 'output:we`ird.png', overwrite: true }, 'overwrite_and_close');
  expect(reason.match(/`/g)).toHaveLength(2);
});

// ---- L7: screenshots with export turned off ----

it('with export off, only writes screenshots to new files with automatic names', () => {
  const { fn, output } = plugin({ allow_export: false });
  const url = 'data:image/png;base64,iVBORw0KGgo=';
  expect(() => fn.writePng(url, 'output:chosen.png', 'auto.png', true)).toThrow('Leave out "path"');
  expect(fn.writePng(url, undefined, 'auto.png', true).path).toBe(join(output, 'auto.png'));
  expect(() => fn.writePng(url, undefined, 'auto.png', true)).toThrow('File exists');
});

// ---- L8: work per request ----

it('caps numbers, coordinates and rotations', () => {
  const { fn } = plugin();
  expect(() => fn.num(2e6, 'x')).toThrow('within -1000000..1000000');
  expect(() => fn.vec([5000, 0, 0], 3, null, 'from', fn.LIMITS.coord)).toThrow('within -4096..4096');
  expect(() => fn.vec([0, 400, 0], 3, null, 'rotation', fn.LIMITS.angle)).toThrow('within -360..360');
  expect(fn.vec([4096, -4096, 0], 3, null, 'from', fn.LIMITS.coord)).toEqual([4096, -4096, 0]);
});

it('caps texture_draw by characters and by painted pixels', () => {
  const { fn } = plugin();
  expect(() => fn.checkDrawWork(Array(300).fill('a'.repeat(1000)), 1)).toThrow('characters');
  expect(() => fn.checkDrawWork(Array(64).fill('a'.repeat(100)), 64)).toThrow('pixels');
  expect(() => fn.checkDrawWork(Array(16).fill('a'.repeat(16)), 4)).not.toThrow();
});

it('caps keyframes per call', () => {
  const { fn } = plugin(undefined, { Project: {}, Animator: { animations: [{ name: 'walk' }] } });
  const keyframes = Array.from({ length: 4097 }, (_, i) => ({ time: i / 100, value: 0 }));
  expect(() => fn.endpoints.add_keyframes({ animation: 'walk', tracks: [{ bone: 'body', keyframes }] })).toThrow('4097 keyframes');
});

it('caps bones and counts mesh polygons as cubes when opening a model', () => {
  const { fn } = plugin({ max_cubes: 10 });
  const bones = Array.from({ length: 4097 }, (_, i) => ({ name: `b${i}` }));
  expect(() => fn.checkGeoJson({ 'minecraft:geometry': [{ description: { identifier: 'geometry.big' }, bones }] }, 'x')).toThrow('4097 bones');
  const mesh = { name: 'm', poly_mesh: { polys: Array(20).fill([[0, 0, 0]]) } };
  expect(() => fn.checkGeoJson({ 'minecraft:geometry': [{ description: { identifier: 'geometry.mesh' }, bones: [mesh] }] }, 'x')).toThrow('20 cubes');
});

// ---- M4, L1, L2: the HTTP layer ----

let box: Sandbox;
let port: number;

beforeAll(async () => {
  port = await freePort();
  box = loadPlugin(NAMES, { settings: { port } });
  box.fn.startServer();
  for (let i = 0; i < 50 && !box.fn.state.server?.listening; i++) await new Promise((r) => setTimeout(r, 20));
});

afterAll(() => box.fn.stopServer());

function post(path: string, headers: Record<string, string | number>, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers, agent: false }, (res) => {
      let text = '';
      res.on('data', (c: Buffer) => (text += c.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Sends raw bytes and resolves with what comes back before the socket closes. */
function raw(bytes: Buffer, keepOpen = false): Promise<string> {
  return new Promise((resolve) => {
    const sock = connect(port, '127.0.0.1');
    let text = '';
    sock.on('data', (c) => (text += c.toString('latin1')));
    sock.on('close', () => resolve(text));
    sock.on('error', () => resolve(text));
    sock.write(bytes);
    if (!keepOpen) setTimeout(() => sock.end(), 2000);
  });
}

const token = () => box.fn.state.token as string;

it('proves it holds the token on /hello without the token being sent', async () => {
  const nonce = 'c'.repeat(64);
  const reply = await post('/hello', { 'Content-Type': 'application/json' }, JSON.stringify({ nonce }));
  expect(reply.status).toBe(200);
  const expected = createHmac('sha256', token()).update(`stonecut-bridge-proof:${nonce}`).digest('hex');
  expect(JSON.parse(reply.body)).toEqual({ ok: true, result: { proof: expected } });
  expect((await post('/hello', { 'Content-Type': 'application/json' }, '{"nonce":"short"}')).status).toBe(400);
  expect((await post('/hello', { 'Content-Type': 'application/json', Origin: 'http://example.com' }, JSON.stringify({ nonce }))).status).toBe(403);
});

it('writes a new token to the file every time the bridge starts', () => {
  const file = join(box.home, '.stonecut_blockbench_token');
  const first = readFileSync(file, 'utf8').trim();
  box.fn.stopServer();
  box.fn.startServer();
  const second = readFileSync(file, 'utf8').trim();
  expect(second).toMatch(/^[0-9a-f]{64}$/);
  expect(second).not.toBe(first);
  expect(token()).toBe(second);
});

it('refuses a wrong token as soon as the headers arrive, without waiting for the body', async () => {
  const head = 'POST /status HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nX-Stonecut-Token: wrong\r\nContent-Length: 1000000\r\n\r\n';
  const started = Date.now();
  const text = await raw(Buffer.from(head, 'latin1'), true);
  expect(text).toMatch(/^HTTP\/1\.1 401/);
  expect(Date.now() - started).toBeLessThan(1500);
});

it('does not crash on a token with non-ASCII bytes', async () => {
  const head = Buffer.concat([
    Buffer.from('POST /ping HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nX-Stonecut-Token: ', 'latin1'),
    Buffer.alloc(64, 0xe9),
    Buffer.from('\r\nContent-Length: 2\r\n\r\n{}', 'latin1'),
  ]);
  expect(await raw(head, true)).toMatch(/^HTTP\/1\.1 401/);
  const ok = await post('/ping', { 'Content-Type': 'application/json', 'X-Stonecut-Token': token() }, '{}');
  expect(ok.status).toBe(200);
});

it('reads a large body that arrives in many pieces', async () => {
  const body = JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024) });
  const reply = await post('/ping', { 'Content-Type': 'application/json', 'X-Stonecut-Token': token(), 'Content-Length': Buffer.byteLength(body) }, body);
  expect(reply.status).toBe(200);
});

it('closes a connection whose headers never finish', async () => {
  box.fn.state.headerTimeoutMs = 200;
  try {
    const started = Date.now();
    await raw(Buffer.from('POST /ping HTTP/1.1\r\nHost: 127.0.0.1\r\n', 'latin1'), true);
    expect(Date.now() - started).toBeLessThan(1500);
  } finally {
    box.fn.state.headerTimeoutMs = undefined;
  }
});

it('refuses connections beyond the cap', async () => {
  const open: Socket[] = [];
  for (let i = 0; i < 8; i++) {
    const s = connect(port, '127.0.0.1');
    await new Promise((r) => s.on('connect', r));
    open.push(s);
  }
  try {
    expect(await raw(Buffer.from('POST /ping HTTP/1.1\r\n', 'latin1'), true)).toMatch(/^HTTP\/1\.1 503/);
  } finally {
    open.forEach((s) => s.destroy());
  }
});

// ---- The fs Blockbench really gives a plugin ----

it('runs every plugin test against an fs with only the functions Blockbench gives a plugin', () => {
  const f = blockbenchScopedFs(tempDir('scope'));
  expect(Object.keys(f).filter((k) => k !== 'scope').sort()).toEqual([...BLOCKBENCH_FS_SYNC].sort());
  for (const missing of ['realpathSync', 'lstatSync', 'readlinkSync', 'opendirSync']) expect(f[missing], missing).toBeUndefined();
});

it('reads, writes, checks links and guards the bridge files with only those functions', () => {
  const { fn, output } = plugin();
  const target = fn.checkPath('output:deep/model.json', ['.json']);
  expect(target.fs.realpathSync).toBeUndefined();
  mkdirSync(join(output, 'deep'), { recursive: true });
  writeFileSync(target.full, '{"minecraft:geometry": []}');
  expect(fn.checkPath('output:deep/model.json', ['.json']).full).toBe(join(output, 'deep', 'model.json'));
  expect(() => fn.checkPath('output:deep/.stonecut_blockbench_token.json', ['.json'])).not.toThrow();
  expect(() => fn.checkPath(`output:deep/${CONFIG.toUpperCase()}`, ['.json'])).toThrow('belongs to the bridge');
});

it('refuses the file, never skips the link check, when the fs cannot list folders', () => {
  const home = tempDir('home');
  const output = tempDir('output');
  const { fn } = loadPlugin(NAMES, { home, settings: { output_folder: output }, fsWithout: ['readdirSync'] });
  expect(() => fn.checkPath('output:a.png', ['.png'])).toThrow('links cannot be checked');
});

// ---- open_model: no texture lookup outside the folders, plain identifiers only ----

it('refuses geometry identifiers that are not plain names', () => {
  const { fn } = plugin();
  const geo = (identifier: unknown) => ({ 'minecraft:geometry': [{ description: { identifier }, bones: [] }] });
  for (const bad of ['geometry.x/../../../../secret', 'geometry.a/b', 'geometry.a\\b', 'x.cube', '', undefined, 5]) {
    expect(() => fn.checkGeoJson(geo(bad), 'm.geo.json'), String(bad)).toThrow('description.identifier');
  }
  expect(() => fn.checkGeoJson(geo('geometry.cube_mob'), 'm.geo.json')).not.toThrow();
  expect(() => fn.checkGeoJson(JSON.parse(readFileSync(new URL('../../fixtures/cube_mob.geo.json', import.meta.url), 'utf8')), 'f')).not.toThrow();
});

it('switches off Blockbench\'s own entity and block texture lookup while a model loads, then puts it back', () => {
  const state: string[] = [];
  class BedrockEntityManager { initEntity() { state.push('entity lookup ran'); } }
  class BedrockBlockManager { initBlock() { state.push('block lookup ran'); } }
  const originals = [BedrockEntityManager.prototype.initEntity, BedrockBlockManager.prototype.initBlock];
  const Codecs = { bedrock: { load: () => {
    new BedrockEntityManager().initEntity();
    new BedrockBlockManager().initBlock();
    state.push('loaded');
    throw new Error('stop here');
  } } };
  const { fn } = plugin(undefined, { BedrockEntityManager, BedrockBlockManager, Codecs });
  expect(() => fn.loadGeo({}, 'm.geo.json')).toThrow('stop here');
  expect(state).toEqual(['loaded']);
  expect([BedrockEntityManager.prototype.initEntity, BedrockBlockManager.prototype.initBlock]).toEqual(originals);
  expect(fn.withoutTextureLookup(() => 7)).toBe(7);
  new BedrockEntityManager().initEntity();
  expect(state).toEqual(['loaded', 'entity lookup ran']);
});

// ---- Windows paths ----

it('finds the PNG next to a Java model when Blockbench asks with a backslash path', () => {
  const { fn, output } = plugin();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 16, 0, 0, 0, 16]);
  writeFileSync(join(output, 'sword.png'), png);
  const load = fn.javaTextureLoader({ full: join(output, 'sword.json') }, null);
  expect(Buffer.compare(load('X:\\pack\\assets\\textures\\item\\sword.png'), png)).toBe(0);
});

it('refuses Windows device names in a path', () => {
  const { fn } = plugin();
  for (const bad of ['output:con.png', 'output:sub/LPT1.json', 'output:aux/x.png', 'output:NUL.png', 'output:Com3.json']) {
    expect(() => fn.checkPath(bad, ['.png', '.json']), bad).toThrow('device name');
  }
  for (const good of ['output:icon.png', 'output:console.png', 'output:com.png', 'output:auxiliary/x.png']) {
    expect(() => fn.checkPath(good, ['.png']), good).not.toThrow();
  }
});

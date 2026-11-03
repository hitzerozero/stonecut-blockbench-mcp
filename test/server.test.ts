import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { afterEach, expect, it } from 'vitest';
import { fail, ok, startFakeBridge, type FakeBridge, type Handler } from './helpers/fake-bridge.js';
import { call, callError, connectClient, firstText } from './helpers/mcp-client.js';

const TOOL_NAMES = [
  'add_animation', 'add_bones', 'add_cubes', 'add_keyframes', 'close_tab', 'display_get', 'display_screenshot',
  'display_set', 'export', 'new_java_item', 'new_project', 'open_java_model', 'open_model', 'ping', 'screenshot',
  'status', 'texture_create', 'texture_draw', 'texture_fill_rect', 'texture_import', 'texture_set_pixels',
];
const PNG_DATA = Buffer.from('fake png bytes').toString('base64');

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function clientWith(handlers: Record<string, Handler>): Promise<Client> {
  fake = await startFakeBridge(handlers);
  return connectClient(fake);
}

it('lists exactly the documented tools', async () => {
  const client = await clientWith({});
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
  expect(client.getInstructions()).toMatch(/output:/);
});

it('passes a valid call through to the bridge and returns its result as text', async () => {
  const client = await clientWith({ add_bones: () => ok({ added: ['root', 'head'] }) });
  const bones = [{ name: 'root' }, { name: 'head', parent: 'root', pivot: [0, 8, 0] }];
  const result = await call(client, 'add_bones', { bones });
  expect(result.isError).toBeFalsy();
  expect(JSON.parse(firstText(result))).toEqual({ added: ['root', 'head'] });
  expect(fake!.requests[0]!.body).toEqual({ bones });
});

it('refuses bad input before anything reaches the bridge', async () => {
  const client = await clientWith({});
  expect(await callError(client, 'texture_fill_rect', { x: 0, y: 0, w: 1, h: 1, color: 'red' })).toMatch(/rrggbb/);
  expect(await callError(client, 'add_cubes', { cubes: [{ bone: 'body', from: [0, 0, 0] }] })).toMatch(/from/);
  expect(await callError(client, 'add_bones', { bones: [{ name: '../escape' }] })).toMatch(/1-64 characters/);
  expect(await callError(client, 'display_set', { slot: 'gui', translation: [0, 90, 0] })).toMatch(/-80\.\.80/);
  expect(await callError(client, 'export', { geo: 'output:mob.json' })).toMatch(/\.geo\.json/);
  expect(fake!.requests).toHaveLength(0);
});

it('returns screenshots as images and keeps the base64 out of the text', async () => {
  const files = [{ view: 'iso', path: '/out/a.png', data: PNG_DATA }, { view: 'front', path: '/out/b.png', data: PNG_DATA }];
  const client = await clientWith({ screenshot: () => ok({ files, size: [512, 512], animation: null, time: null }) });
  const result = await call(client, 'screenshot', { views: ['iso', 'front'] });
  expect(result.content.filter((c) => c.type === 'image')).toEqual([
    { type: 'image', data: PNG_DATA, mimeType: 'image/png' },
    { type: 'image', data: PNG_DATA, mimeType: 'image/png' },
  ]);
  expect(firstText(result)).not.toContain(PNG_DATA);
  expect(JSON.parse(firstText(result)).files[1]).toEqual({ view: 'front', path: '/out/b.png' });
});

it('reports a plugin refusal as a tool error', async () => {
  const client = await clientWith({ export: () => fail('Path not allowed: /etc/x.png') });
  const result = await call(client, 'export', { texture: '/etc/x.png' });
  expect(result.isError).toBe(true);
  expect(firstText(result)).toBe('export: Path not allowed: /etc/x.png');
});

it('reports a reply of the wrong shape as a tool error', async () => {
  const client = await clientWith({ screenshot: () => ok({ files: [{ path: '/x.png', data: '***' }], size: [1, 1] }) });
  const result = await call(client, 'screenshot', {});
  expect(result.isError).toBe(true);
  expect(firstText(result)).toMatch(/unexpected reply/);
});

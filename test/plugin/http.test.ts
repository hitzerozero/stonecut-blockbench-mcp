import { request } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freePort } from '../helpers/fake-bridge.js';
import { call, connectClient, firstText } from '../helpers/mcp-client.js';
import { loadPlugin, type Sandbox } from '../helpers/sandbox.js';

let box: Sandbox;
let port: number;
let token: string;

interface Raw {
  status: number;
  body: string;
}

function raw(path: string, headers: Record<string, string>, body = '{}', method = 'POST'): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      let text = '';
      res.on('data', (c: Buffer) => (text += c.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const good = () => ({ 'Content-Type': 'application/json', 'X-Stonecut-Token': token });

async function waitForListening(): Promise<void> {
  for (let i = 0; i < 50 && !box.fn.state.server?.listening; i++) await new Promise((r) => setTimeout(r, 20));
}

beforeAll(async () => {
  port = await freePort();
  box = loadPlugin(['startServer', 'stopServer', 'state'], { settings: { port } });
  box.fn.startServer();
  await waitForListening();
  token = box.fn.state.token;
});

afterAll(() => box.fn.stopServer());

it('answers ping and status through the MCP server', async () => {
  const client = await connectClient({ port, tokenFile: join(box.home, '.stonecut_blockbench_token') });
  expect(JSON.parse(firstText(await call(client, 'ping')))).toEqual({ pong: true, version: '1.0.0' });
  const status = JSON.parse(firstText(await call(client, 'status')));
  expect(status.roots).toEqual({ output: join(box.home, 'stonecut-blockbench') });
  expect(status.project).toBeNull();
  expect(status.geckolib_plugin_installed).toBe(false);
});

it('passes the plugin refusal back as a tool error', async () => {
  const client = await connectClient({ port, tokenFile: join(box.home, '.stonecut_blockbench_token') });
  const result = await call(client, 'export', { texture: 'output:x.png' });
  expect(result.isError).toBe(true);
  expect(firstText(result)).toMatch(/^export: No project open/);
});

it('refuses requests without the right token', async () => {
  expect((await raw('/ping', { 'Content-Type': 'application/json' })).status).toBe(401);
  expect((await raw('/ping', { ...good(), 'X-Stonecut-Token': 'f'.repeat(64) })).status).toBe(401);
});

it('refuses web pages and other hosts', async () => {
  expect((await raw('/ping', { ...good(), Origin: 'http://example.com' })).status).toBe(403);
  expect((await raw('/ping', { ...good(), Host: 'evil.example:80' })).status).toBe(403);
});

it('refuses wrong methods, content types, endpoints and bodies', async () => {
  expect((await raw('/ping', good(), '', 'GET')).status).toBe(405);
  expect((await raw('/ping', { ...good(), 'Content-Type': 'text/plain' })).status).toBe(415);
  expect((await raw('/eval', good())).status).toBe(404);
  expect((await raw('/__proto__', good())).status).toBe(404);
  expect((await raw('/ping', good(), '[1]')).status).toBe(400);
  expect((await raw('/ping', good(), '{oops')).status).toBe(400);
});

it('replies 422 with the reason when an endpoint refuses', async () => {
  const reply = await raw('/new_project', good(), JSON.stringify({ name: '../x' }));
  expect(reply.status).toBe(422);
  expect(JSON.parse(reply.body)).toEqual({ ok: false, error: 'name must be 1-64 chars of A-Z a-z 0-9 _ . -' });
});

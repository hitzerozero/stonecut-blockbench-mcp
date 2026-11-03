import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { BridgeError, createBridge } from '../src/bridge.js';
import { pingReply } from '../src/replies.js';
import { fail, freePort, ok, startFakeBridge, type FakeBridge, type Handler } from './helpers/fake-bridge.js';
import { tempDir } from './helpers/temp.js';

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function bridgeWith(handlers: Record<string, Handler>) {
  fake = await startFakeBridge(handlers);
  return createBridge({ port: fake.port, tokenFile: fake.tokenFile, timeoutMs: 5000 });
}

it('posts JSON with the token header and returns the checked result', async () => {
  const bridge = await bridgeWith({ ping: () => ok({ pong: true, version: '1.0.0' }) });
  const result = await bridge.call('ping', { a: 1 }, pingReply);
  expect(result.version).toBe('1.0.0');
  const sent = fake!.requests[0]!;
  expect(sent.endpoint).toBe('ping');
  expect(sent.body).toEqual({ a: 1 });
  expect(sent.headers['x-stonecut-token']).toBe('ab'.repeat(32));
  expect(sent.headers['content-type']).toBe('application/json');
  expect(sent.headers.origin).toBeUndefined();
});

it('turns an error reply into a BridgeError with the plugin message', async () => {
  const bridge = await bridgeWith({ add_bones: () => fail('Bone name already used: head') });
  const call = bridge.call('add_bones', {}, z.unknown());
  await expect(call).rejects.toBeInstanceOf(BridgeError);
  await expect(call).rejects.toThrow('add_bones: Bone name already used: head');
});

it('refuses a reply that does not match the expected shape', async () => {
  const bridge = await bridgeWith({ ping: () => ok({ pong: 'yes' }) });
  await expect(bridge.call('ping', {}, pingReply)).rejects.toThrow(/unexpected reply/);
});

it('refuses a reply that is not JSON or has no ok field', async () => {
  const bridge = await bridgeWith({ a: () => ({ raw: '<html>' }), b: () => ({ json: { result: 1 } }) });
  await expect(bridge.call('a', {}, z.unknown())).rejects.toThrow(/not JSON/);
  await expect(bridge.call('b', {}, z.unknown())).rejects.toThrow(/unknown shape/);
});

it('explains a missing or broken token file', async () => {
  const dir = tempDir('token');
  const missing = createBridge({ port: 1, tokenFile: join(dir, 'none'), timeoutMs: 1000 });
  await expect(missing.call('ping', {}, pingReply)).rejects.toThrow(/No token at/);
  writeFileSync(join(dir, 'broken'), 'not-a-token');
  const broken = createBridge({ port: 1, tokenFile: join(dir, 'broken'), timeoutMs: 1000 });
  await expect(broken.call('ping', {}, pingReply)).rejects.toThrow(/does not hold a valid token/);
});

it('explains when nothing is listening', async () => {
  fake = await startFakeBridge({});
  const bridge = createBridge({ port: await freePort(), tokenFile: fake.tokenFile, timeoutMs: 1000 });
  await expect(bridge.call('ping', {}, pingReply)).rejects.toThrow(/Bridge not reachable on 127\.0\.0\.1:\d+.*Blockbench/);
});

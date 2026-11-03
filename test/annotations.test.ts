import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { startFakeBridge, type FakeBridge } from './helpers/fake-bridge.js';
import { connectClient } from './helpers/mcp-client.js';

// [readOnlyHint, destructiveHint, idempotentHint] for every tool. openWorldHint is always false.
const EXPECTED: Record<string, [boolean, boolean, boolean]> = {
  ping: [true, false, true],
  status: [true, false, true],
  display_get: [true, false, true],
  new_project: [false, false, false],
  open_model: [false, false, false],
  open_java_model: [false, false, false],
  new_java_item: [false, false, false],
  add_bones: [false, false, false],
  add_cubes: [false, false, false],
  add_animation: [false, false, false],
  add_keyframes: [false, false, false],
  close_tab: [false, true, true],
  texture_create: [false, true, true],
  texture_fill_rect: [false, true, true],
  texture_set_pixels: [false, true, true],
  texture_draw: [false, true, true],
  texture_import: [false, true, true],
  display_set: [false, true, true],
  export: [false, true, true],
  screenshot: [false, true, false],
  display_screenshot: [false, true, false],
};

let fake: FakeBridge;
let tools: Tool[];

beforeAll(async () => {
  fake = await startFakeBridge({});
  tools = (await (await connectClient(fake)).listTools()).tools;
});

afterAll(() => fake.close());

it('gives every tool all four hints as booleans', () => {
  expect(tools.length).toBe(Object.keys(EXPECTED).length);
  for (const t of tools) {
    const a = t.annotations ?? {};
    for (const key of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
      expect(typeof a[key], `${t.name}.${key}`).toBe('boolean');
    }
  }
});

it('gives each tool the hints that match what it does', () => {
  for (const t of tools) {
    const a = t.annotations!;
    expect([a.readOnlyHint, a.destructiveHint, a.idempotentHint], t.name).toEqual(EXPECTED[t.name]);
  }
});

it('marks no tool as reaching the outside world, since the bridge is local only', () => {
  expect(tools.filter((t) => t.annotations?.openWorldHint !== false).map((t) => t.name)).toEqual([]);
});

it('never marks a read-only tool as destructive', () => {
  const contradictions = tools.filter((t) => t.annotations?.readOnlyHint && t.annotations?.destructiveHint);
  expect(contradictions.map((t) => t.name)).toEqual([]);
});

it('marks only ping, status and display_get as read-only', () => {
  expect(tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort()).toEqual(['display_get', 'ping', 'status']);
});

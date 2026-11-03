import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const results = [];

/** Each run writes into its own folder, so nothing is ever replaced and no confirm question comes up. */
export const RUN = new Date().toISOString().replace(/[:.]/g, '-');

export function check(label, condition, detail = '') {
  results.push(Boolean(condition));
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition ? '' : `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  return Boolean(condition);
}

export function summary() {
  return { passed: results.filter(Boolean).length, total: results.length };
}

function stringEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string'));
}

export async function connect() {
  const server = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [server], env: stringEnv(), stderr: 'inherit' });
  const client = new Client({ name: 'stonecut-selftest', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

async function callTool(client, name, args) {
  try {
    return await client.callTool({ name, arguments: args });
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] };
  }
}

export async function step(client, label, name, args = {}) {
  const reply = await callTool(client, name, args);
  const text = reply.content.find((c) => c.type === 'text')?.text ?? '';
  check(label, !reply.isError, text);
  const result = reply.isError ? {} : JSON.parse(text);
  if (result.warning) console.log(`      WARNING: ${result.warning}`);
  return { result, images: reply.content.filter((c) => c.type === 'image') };
}

export async function refused(client, label, name, args) {
  const reply = await callTool(client, name, args);
  check(label, reply.isError, 'expected a refusal');
}

export function fileLooksWritten(label, path) {
  check(`${label}: ${path}`, existsSync(path) && statSync(path).size > 100, 'missing or empty');
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    check(`readable JSON ${path}`, false, String(e));
    return {};
  }
}

export function copyFixtures(output) {
  const dir = join(output, 'selftest', 'fixtures');
  mkdirSync(dir, { recursive: true });
  for (const name of ['cube_mob.geo.json', 'cube_mob.animation.json', 'plain_sword.json']) {
    copyFileSync(fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url)), join(dir, name));
  }
  return 'output:selftest/fixtures/';
}

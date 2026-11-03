import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { proofFor } from '../../src/bridge.js';
import { tempDir, writeToken } from './temp.js';

export interface Recorded {
  endpoint: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface FakeReply {
  status?: number;
  raw?: string;
  json?: unknown;
}

export type Handler = (body: Record<string, unknown>) => FakeReply;

export interface FakeBridge {
  port: number;
  tokenFile: string;
  requests: Recorded[];
  /** Identity checks (POST /hello), kept apart from the tool requests. */
  hellos: Recorded[];
  close(): Promise<void>;
}

export const ok = (result: unknown): FakeReply => ({ json: { ok: true, result } });

export const fail = (error: string): FakeReply => ({ status: 422, json: { ok: false, error } });

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function send(res: ServerResponse, reply: FakeReply): void {
  res.writeHead(reply.status ?? 200, { 'Content-Type': 'application/json' });
  res.end(reply.raw ?? JSON.stringify(reply.json));
}

export interface FakeOptions {
  /** Answer the identity check with a wrong proof, like a program that does not hold the token. */
  impostor?: boolean;
  /** Behave like an older bridge that has no identity check. */
  noHello?: boolean;
}

export const FAKE_TOKEN = 'ab'.repeat(32);

export async function startFakeBridge(handlers: Record<string, Handler>, options: FakeOptions = {}): Promise<FakeBridge> {
  const requests: Recorded[] = [];
  const hellos: Recorded[] = [];
  const server = createServer(async (req, res) => {
    const endpoint = (req.url ?? '').replace(/^\//, '');
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    if (endpoint === 'hello' && !options.noHello) {
      hellos.push({ endpoint, headers: req.headers, body });
      const proof = options.impostor ? 'f'.repeat(64) : proofFor(FAKE_TOKEN, String(body.nonce));
      return send(res, ok({ proof }));
    }
    requests.push({ endpoint, headers: req.headers, body });
    send(res, handlers[endpoint]?.(body) ?? { status: 404, json: { ok: false, error: `Unknown endpoint: ${endpoint}` } });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { port, tokenFile: writeToken(tempDir('fake-bridge'), FAKE_TOKEN), requests, hellos, close };
}

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

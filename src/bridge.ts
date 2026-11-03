import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { request, type IncomingMessage } from 'node:http';
import { z } from 'zod';
import { TOKEN_HEADER, type BridgeConfig } from './config.js';

export class BridgeError extends Error {
  /** True when the message holds text the bridge sent, which nobody has checked. */
  constructor(message: string, readonly fromBridge = false) {
    super(message);
  }
}

export interface Bridge {
  call<R extends z.ZodType>(endpoint: string, params: object, reply: R): Promise<z.output<R>>;
}

interface RawReply {
  status: number;
  text: string;
}

const tokenSchema = z.string().trim().regex(/^[0-9a-f]{64}$/);

const envelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const PLUGIN_HINT = 'Is Blockbench open with the Stonecut Bridge plugin loaded?';

/** Label mixed into the bridge's proof, so the HMAC cannot be reused for anything else. */
export const PROOF_LABEL = 'stonecut-bridge-proof:';

export function proofFor(token: string, nonce: string): string {
  return createHmac('sha256', token).update(PROOF_LABEL + nonce).digest('hex');
}

const helloReply = z.object({ proof: z.string().regex(/^[0-9a-f]{64}$/) });

async function readToken(file: string): Promise<string> {
  const text = await readFile(file, 'utf8').catch(() => {
    throw new BridgeError(`No token at ${file}. ${PLUGIN_HINT}`);
  });
  const parsed = tokenSchema.safeParse(text);
  if (!parsed.success) throw new BridgeError(`The token file ${file} does not hold a valid token. Restart the bridge in Blockbench.`);
  return parsed.data;
}

function collect(res: IncomingMessage, resolve: (r: RawReply) => void, reject: (e: Error) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
  res.on('error', reject);
}

function unreachable(config: BridgeConfig, e: Error & { code?: string }): BridgeError {
  if (e instanceof BridgeError) return e;
  return new BridgeError(`Bridge not reachable on 127.0.0.1:${config.port} (${e.code ?? e.message}). ${PLUGIN_HINT}`);
}

function post(config: BridgeConfig, endpoint: string, token: string | null, body: string): Promise<RawReply> {
  const headers: Record<string, string | number> = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  if (token !== null) headers[TOKEN_HEADER] = token;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: config.port, path: `/${endpoint}`, method: 'POST', agent: false, headers },
      (res) => collect(res, resolve, reject));
    req.setTimeout(config.timeoutMs, () => req.destroy(new BridgeError(`${endpoint}: no reply within ${config.timeoutMs} ms`)));
    req.on('error', (e) => reject(unreachable(config, e)));
    req.end(body);
  });
}

function parseEnvelope(raw: RawReply, endpoint: string): unknown {
  let json: unknown;
  try {
    json = JSON.parse(raw.text);
  } catch {
    throw new BridgeError(`${endpoint}: the bridge sent a reply that is not JSON (HTTP ${raw.status})`);
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) throw new BridgeError(`${endpoint}: the bridge sent a reply of unknown shape (HTTP ${raw.status})`);
  if (!envelope.data.ok) throw new BridgeError(`${endpoint}: ${envelope.data.error}`, true);
  return envelope.data.result;
}

/**
 * Before the token is ever sent, the program on the port must prove it already holds it: it gets a
 * fresh random nonce and answers with HMAC-SHA256(token, label + nonce). Something else listening on the
 * port cannot answer, so it never sees the token.
 */
async function verifyBridge(config: BridgeConfig, token: string): Promise<void> {
  const nonce = randomBytes(32).toString('hex');
  const raw = await post(config, 'hello', null, JSON.stringify({ nonce }));
  let proof: string;
  try {
    const parsed = helloReply.safeParse(parseEnvelope(raw, 'hello'));
    if (!parsed.success) throw new BridgeError('no valid proof in the reply');
    proof = parsed.data.proof;
  } catch (e) {
    throw new BridgeError(`The program on 127.0.0.1:${config.port} did not pass the identity check, so the token was not sent `
      + `(${e instanceof Error ? e.message : String(e)}). If it is an older Stonecut Bridge, load the plugin for this server version.`,
      e instanceof BridgeError && e.fromBridge);
  }
  if (!timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(proofFor(token, nonce), 'hex'))) {
    throw new BridgeError(`The program on 127.0.0.1:${config.port} could not prove it holds the token, so the token was not sent. `
      + 'It may not be the Stonecut Bridge. Restart the bridge in Blockbench and try again.');
  }
}

export function createBridge(config: BridgeConfig): Bridge {
  return {
    async call(endpoint, params, reply) {
      const token = await readToken(config.tokenFile);
      await verifyBridge(config, token);
      const raw = await post(config, endpoint, token, JSON.stringify(params));
      const result = reply.safeParse(parseEnvelope(raw, endpoint));
      if (!result.success) throw new BridgeError(`${endpoint}: unexpected reply from the bridge:\n${z.prettifyError(result.error)}`);
      return result.data;
    },
  };
}

const STATUS = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 411: 'Length Required', 413: 'Payload Too Large', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 431: 'Request Header Fields Too Large', 503: 'Service Unavailable' };
const MAX_HEAD = 16 * 1024;
const MAX_CONNECTIONS = 8;
const HEADER_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 300000;
const PROOF_LABEL = 'stonecut-bridge-proof:';

function reply(sock, code, obj) {
  if (sock.destroyed) return;
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = `HTTP/1.1 ${code} ${STATUS[code] || 'Error'}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`;
  sock.end(Buffer.concat([Buffer.from(head, 'latin1'), body]));
}
function sha(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest(); }
/** Compares fixed-size hashes, so any header text (any length, any characters) is safe to compare. */
function tokenOk(t) {
  if (typeof t !== 'string' || !state.token) return false;
  return crypto.timingSafeEqual(sha(t), sha(state.token));
}
/** POST /hello {nonce}: proves this bridge holds the token without anyone sending it. Needs no token. */
function helloProof(params) {
  if (!params || typeof params.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(params.nonce)) return null;
  return crypto.createHmac('sha256', state.token).update(PROOF_LABEL + params.nonce).digest('hex');
}
function refusal(method, h, ep) {
  const host = String(h.host || '').replace(/:\d+$/, '').toLowerCase();
  if (h.origin !== undefined || !['127.0.0.1', 'localhost'].includes(host)) return [403, 'Forbidden'];
  const hello = ep === 'hello';
  if (!hello && !tokenOk(h[TOKEN_HEADER])) return [401, 'Missing or wrong X-Stonecut-Token'];
  if (method !== 'POST') return [405, 'Use POST /<endpoint>'];
  if (!/^application\/json\s*(;|$)/i.test(h['content-type'] || '')) return [415, 'Content-Type must be application/json'];
  if (!hello && !Object.prototype.hasOwnProperty.call(endpoints, ep)) return [404, 'Unknown endpoint: ' + ep];
  return null;
}
function parseBody(body) {
  try {
    const v = body ? JSON.parse(body) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}
async function runEndpoint(sock, ep, params) {
  try {
    await confirmIfNeeded(ep, params, conf());
    reply(sock, 200, { ok: true, result: await endpoints[ep](params) });
  }
  catch (e) { console.warn('[' + TITLE + ']', ep, e); reply(sock, 422, { ok: false, error: String((e && e.message) || e) }); }
}
function handle(sock, ep, body) {
  const params = parseBody(body);
  if (!params) return reply(sock, 400, { ok: false, error: 'Body must be a JSON object' });
  if (ep === 'hello') {
    const proof = helloProof(params);
    return proof ? reply(sock, 200, { ok: true, result: { proof } }) : reply(sock, 400, { ok: false, error: 'Give "nonce": 64 hex characters' });
  }
  state.queue = state.queue.then(() => runEndpoint(sock, ep, params));
}
function parseHead(buf, end) {
  const lines = buf.slice(0, end).toString('latin1').split('\r\n');
  const [method, target] = lines[0].split(' ');
  const h = {};
  lines.slice(1).forEach((l) => { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
  return { method, target, h };
}
/** Reads the headers and refuses at once if they are wrong, before any body is collected. */
function takeHead(sock, c) {
  const fail = (code, error) => { reply(sock, code, { ok: false, error }); return true; };
  const buf = Buffer.concat(c.chunks);
  c.chunks = [buf];
  const end = buf.indexOf('\r\n\r\n');
  if (end < 0) return buf.length > MAX_HEAD ? fail(431, 'Headers too large') : false;
  const head = parseHead(buf, end);
  if (head.h['transfer-encoding']) return fail(411, 'Send a Content-Length body');
  c.len = parseInt(head.h['content-length'] || '0', 10) || 0;
  if (c.len < 0 || c.len > MAX_BODY) return fail(413, 'Request too large');
  c.ep = String(head.target || '').split('?')[0].replace(/^\/+/, '');
  const no = refusal(head.method, head.h, c.ep);
  if (no) return fail(no[0], no[1]);
  c.bodyStart = end + 4;
  sock.setTimeout(REQUEST_TIMEOUT_MS);
  return false;
}
function takeRequest(sock, c) {
  if (c.bodyStart === undefined && takeHead(sock, c)) return true;
  if (c.bodyStart === undefined || c.size < c.bodyStart + c.len) return false;
  const buf = Buffer.concat(c.chunks);
  handle(sock, c.ep, buf.slice(c.bodyStart, c.bodyStart + c.len).toString('utf8'));
  return true;
}
function onConnection(sock) {
  state.connections = (state.connections || 0) + 1;
  sock.on('close', () => { state.connections -= 1; });
  sock.on('error', () => sock.destroy());
  if (state.connections > MAX_CONNECTIONS) return reply(sock, 503, { ok: false, error: 'Too many connections' });
  const c = { chunks: [], size: 0, done: false };
  sock.setTimeout(state.headerTimeoutMs || HEADER_TIMEOUT_MS, () => sock.destroy());
  sock.on('data', (chunk) => {
    if (c.done) return;
    c.chunks.push(chunk);
    c.size += chunk.length;
    c.done = takeRequest(sock, c);
  });
}

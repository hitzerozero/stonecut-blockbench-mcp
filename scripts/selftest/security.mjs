import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../dist/config.js';
import { check, refused } from './lib.mjs';

function status(port, headers) {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/ping', method: 'POST', headers, agent: false }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', (e) => resolve(e.message));
    req.end('{}');
  });
}

function hello(port, nonce) {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/hello', method: 'POST', headers: { 'Content-Type': 'application/json' }, agent: false }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => { try { resolve(JSON.parse(text).result?.proof); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.end(JSON.stringify({ nonce }));
  });
}

export async function securityTest(client) {
  const { port, tokenFile } = loadConfig();
  const nonce = randomBytes(32).toString('hex');
  const token = readFileSync(tokenFile, 'utf8').trim();
  const expected = createHmac('sha256', token).update(`stonecut-bridge-proof:${nonce}`).digest('hex');
  check('the bridge proves it holds the token without it being sent', (await hello(port, nonce)) === expected);
  check('a request without the token is refused (401)', (await status(port, { 'Content-Type': 'application/json' })) === 401);
  const fromPage = await status(port, { 'Content-Type': 'application/json', Origin: 'http://example.com' });
  check('a request from a web page is refused (403)', fromPage === 403);
  await refused(client, 'export outside the allowed folders is refused', 'export', { geo: join(homedir(), 'stonecut-outside.geo.json') });
  await refused(client, '".." escape from the output folder is refused', 'export', { geo: 'output:../escape.geo.json' });
  await refused(client, 'a bad colour is refused before Blockbench sees it', 'texture_fill_rect', { x: 0, y: 0, w: 1, h: 1, color: 'red' });
}

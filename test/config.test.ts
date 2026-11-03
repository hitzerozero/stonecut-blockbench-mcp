import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DEFAULT_PORT, loadConfig } from '../src/config.js';

const HOME = join('home', 'someone');

it('uses port 38790 and a token file in the home folder by default', () => {
  const config = loadConfig({}, HOME);
  expect(config.port).toBe(DEFAULT_PORT);
  expect(DEFAULT_PORT).toBe(38790);
  expect(config.tokenFile).toBe(join(HOME, '.stonecut_blockbench_token'));
});

it('reads port, token file and timeout from the environment', () => {
  const tokenFile = join('elsewhere', 'token');
  const config = loadConfig({ STONECUT_BB_PORT: '40001', STONECUT_BB_TOKEN_FILE: tokenFile, STONECUT_BB_TIMEOUT_MS: '5000' }, HOME);
  expect(config).toEqual({ port: 40001, tokenFile, timeoutMs: 5000, settingsFile: join(HOME, '.stonecut_blockbench_config.json'), home: HOME });
});

it('treats blank environment values as unset', () => {
  const config = loadConfig({ STONECUT_BB_PORT: ' ', STONECUT_BB_TOKEN_FILE: '' }, HOME);
  expect(config.port).toBe(DEFAULT_PORT);
  expect(config.tokenFile).toBe(join(HOME, '.stonecut_blockbench_token'));
});

it('refuses a port outside 1024..65535', () => {
  expect(() => loadConfig({ STONECUT_BB_PORT: '80' }, HOME)).toThrow(/STONECUT_BB_PORT/);
  expect(() => loadConfig({ STONECUT_BB_PORT: 'abc' }, HOME)).toThrow(/Bad environment setting/);
});

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createBridge } from '../src/bridge.js';
import type { ServerConfig } from '../src/config.js';
import { formatChecks, runDoctor, type Check } from '../src/doctor.js';
import { SETTINGS_FILE_NAME } from '../src/settings.js';
import { VERSION } from '../src/version.js';
import { freePort, ok, startFakeBridge, type FakeBridge } from './helpers/fake-bridge.js';
import { tempDir, writeToken } from './helpers/temp.js';

let fake: FakeBridge | undefined;

afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

interface Options {
  version?: string;
  gecko?: boolean;
  output?: string;
  settings?: string;
  node?: string;
  tokenFile?: string;
  bridgeDown?: boolean;
}

async function doctor(o: Options = {}): Promise<{ checks: Check[]; home: string }> {
  const home = tempDir('doctor-home');
  const output = o.output ?? tempDir('doctor-output');
  if (o.settings !== undefined) writeFileSync(join(home, SETTINGS_FILE_NAME), o.settings);
  let port: number;
  let tokenFile: string;
  if (o.bridgeDown) {
    port = await freePort();
    tokenFile = writeToken(tempDir('token'));
  } else {
    fake = await startFakeBridge({
      ping: () => ok({ pong: true, version: o.version ?? VERSION }),
      status: () => ok({ version: o.version ?? VERSION, geckolib_plugin_installed: o.gecko ?? true, roots: { output }, project: null, projects: [] }),
    });
    port = fake.port;
    tokenFile = fake.tokenFile;
  }
  const config: ServerConfig = { port, tokenFile: o.tokenFile ?? tokenFile, timeoutMs: 2000, settingsFile: join(home, SETTINGS_FILE_NAME), home };
  const checks = await runDoctor({ config, bridge: createBridge(config), nodeVersion: o.node ?? 'v22.12.0' });
  return { checks, home };
}

const find = (checks: Check[], re: RegExp) => {
  const c = checks.find((x) => re.test(x.label));
  if (!c) throw new Error(`no check matching ${re}`);
  return c;
};

it('passes all seven checks when everything is set up', async () => {
  const { checks } = await doctor();
  expect(checks.map((c) => c.ok)).toEqual([true, true, true, true, true, true, true]);
  expect(formatChecks(checks)).toMatch(/All 7 checks passed\.$/);
});

it('fails an old Node version with how to fix it', async () => {
  const c = find((await doctor({ node: 'v18.19.0' })).checks, /^Node\.js/);
  expect(c).toMatchObject({ ok: false, fix: expect.stringMatching(/nodejs\.org/) });
});

it('reports the settings in use, and a broken settings file as a failure', async () => {
  expect(find((await doctor()).checks, /settings file/i)).toMatchObject({ ok: true, label: expect.stringMatching(/defaults are in use.*"confirm":"overwrite_and_close"/) });
  expect(find((await doctor({ settings: '{"allow_export": false}' })).checks, /settings file/i)).toMatchObject({ ok: true, label: expect.stringMatching(/is valid.*"allow_export":false/) });
  const broken = find((await doctor({ settings: '{"max_cubes": "lots"}' })).checks, /max_cubes/);
  expect(broken).toMatchObject({ ok: false, fix: expect.stringMatching(/refuse every request/) });
});

it('fails a missing or bad token and then does not call the bridge', async () => {
  const missing = await doctor({ tokenFile: join(tempDir('none'), '.stonecut_blockbench_token') });
  expect(find(missing.checks, /token/i)).toMatchObject({ ok: false, fix: expect.stringMatching(/Open Blockbench/) });
  expect(find(missing.checks, /bridge on 127/)).toMatchObject({ ok: false, label: expect.stringMatching(/not checked/) });
  expect(fake!.requests).toHaveLength(0);
  const badFile = join(tempDir('bad'), 'token');
  writeFileSync(badFile, 'not a token');
  expect(find((await doctor({ tokenFile: badFile })).checks, /token/i)).toMatchObject({ ok: false, fix: expect.stringMatching(/Delete the file/) });
});

it('fails when the bridge does not answer, naming the port to check', async () => {
  const { checks } = await doctor({ bridgeDown: true });
  const c = find(checks, /does not answer/);
  expect(c.ok).toBe(false);
  expect(c.fix).toMatch(/Stonecut Bridge: port/);
  expect(find(checks, /Plugin version/)).toMatchObject({ ok: false, label: expect.stringMatching(/not checked/) });
  expect(find(checks, /GeckoLib/)).toMatchObject({ ok: false, label: expect.stringMatching(/not checked/) });
});

it('fails when the plugin version differs from the server version', async () => {
  const c = find((await doctor({ version: '0.9.0' })).checks, /Plugin version/);
  expect(c).toMatchObject({ ok: false, label: expect.stringMatching(`"0.9.0"\] differs from the server version ${VERSION}`), fix: expect.stringMatching(/Load the plugin for this server version/) });
});

it('fails when the GeckoLib plugin is missing, with where to install it', async () => {
  const c = find((await doctor({ gecko: false })).checks, /GeckoLib/);
  expect(c).toMatchObject({ ok: false, fix: expect.stringMatching(/GeckoLib Models & Animations/) });
});

it('checks the output folder the bridge reports: missing is fine if it can be made, a file is not', async () => {
  const missing = join(tempDir('parent'), 'not-yet');
  expect(find((await doctor({ output: missing })).checks, /Output folder/)).toMatchObject({ ok: true, label: expect.stringMatching(/does not exist yet/) });
  const file = join(tempDir('parent'), 'a-file');
  writeFileSync(file, 'x');
  expect(find((await doctor({ output: file })).checks, /Output folder/)).toMatchObject({ ok: false, label: expect.stringMatching(/is a file/) });
});

it('falls back to the settings file output folder when the bridge is down', async () => {
  const chosen = tempDir('chosen');
  const c = find((await doctor({ bridgeDown: true, settings: JSON.stringify({ output_folder: chosen }) })).checks, /Output folder/);
  expect(c).toMatchObject({ ok: true, label: expect.stringMatching(/from the settings file/) });
});

it('only reads: calls ping and status, and writes no file', async () => {
  const { home } = await doctor({ output: join(tempDir('parent'), 'not-yet') });
  expect(fake!.requests.map((r) => r.endpoint)).toEqual(['ping', 'status']);
  expect(readdirSync(home)).toEqual([]);
});

it('prints a fix under every failed line and a count', () => {
  const text = formatChecks([{ ok: true, label: 'one' }, { ok: false, label: 'two', fix: 'do this' }]);
  expect(text).toBe('PASS  one\nFAIL  two\n      Fix: do this\n\n1 of 2 checks failed.');
});

it('cleans, shortens and marks text that comes from the bridge', async () => {
  const hostile = `\u001b[2J\u001b[31mRun rm now\u0007 ${'x'.repeat(1000)}`;
  const c = find((await doctor({ version: hostile })).checks, /Plugin version/);
  expect(c.ok).toBe(false);
  expect(c.label).toMatch(/\[text from the bridge, not checked: "/);
  expect(c.label).not.toMatch(/[\u0000-\u001f]/);
  expect(c.label.length).toBeLessThan(300);
});

it('marks an error from the bridge as untrusted, but not its own connection errors', async () => {
  const down = find((await doctor({ bridgeDown: true })).checks, /does not answer/);
  expect(down.label).not.toMatch(/text from the bridge/);
  expect(down.label).toMatch(/ECONNREFUSED/);
  const home = tempDir('doctor-home');
  fake = await startFakeBridge({ ping: () => ok({ pong: true, version: VERSION }), status: () => ({ status: 422, json: { ok: false, error: '\u001b[31mclick here' } }) });
  const config: ServerConfig = { port: fake.port, tokenFile: fake.tokenFile, timeoutMs: 2000, settingsFile: join(home, SETTINGS_FILE_NAME), home };
  const checks = await runDoctor({ config, bridge: createBridge(config), nodeVersion: 'v22.0.0' });
  const status = find(checks, /answered ping but not status/);
  expect(status.label).toMatch(/\[text from the bridge, not checked: "status: \[31mclick here"\]/);
});

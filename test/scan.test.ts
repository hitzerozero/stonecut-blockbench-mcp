import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LOCAL_NAMES_FILE, localNames, repoRoot, scanRepo, scanText } from '../scripts/scan-personal.mjs';
import { tempDir } from './helpers/temp.js';

// Built from parts so this file does not trip the scan itself.
const winPath = ['C:', 'Users', 'someone', 'Desktop', 'model.json'].join('\\');
const winPathEscaped = ['C:', 'Users', 'someone', 'x'].join('\\\\');
const winPathSlash = ['D:', 'Users', 'someone', 'x'].join('/');
const macPath = ['', 'Users', 'someone', 'models'].join('/');
const linuxPath = ['', 'home', 'someone', 'models'].join('/');
const email = ['someone', 'example.org'].join('@');

const whats = (text: string, names?: Set<string>) => scanText(text, names).map((f: { what: string }) => f.what);

it('finds no personal paths, emails, ports or locally blocked names in any tracked file', () => {
  expect(scanRepo()).toEqual([]);
});

it('keeps no list of names in the repository, not even hashed', () => {
  const script = readFileSync(join(repoRoot(), 'scripts', 'scan-personal.mjs'), 'utf8');
  expect(script).not.toMatch(/[0-9a-f]{40,}/);
  expect(script).not.toMatch(/createHash/);
  expect(execFileSync('git', ['check-ignore', LOCAL_NAMES_FILE], { cwd: repoRoot(), encoding: 'utf8' }).trim()).toBe(LOCAL_NAMES_FILE);
});

it('reads blocked names from the local file and the environment', () => {
  const root = tempDir('scan-root');
  writeFileSync(join(root, LOCAL_NAMES_FILE), 'Zebra Corn\n# a comment\n\nQuux # trailing note\n');
  expect([...localNames(root, { STONECUT_SCAN_NAMES: 'Alpha Beta, gamma' })].sort()).toEqual(['alphabeta', 'gamma', 'quux', 'zebracorn']);
  expect(localNames(tempDir('empty-root'), {}).size).toBe(0);
});

it('flags absolute paths into user folders on every OS', () => {
  expect(whats(`open ${winPath} now`)).toEqual(['absolute path into a Windows user folder']);
  expect(whats(`"path": "${winPathEscaped}"`)).toEqual(['absolute path into a Windows user folder']);
  expect(whats(winPathSlash)).toEqual(['absolute path into a Windows user folder']);
  expect(whats(`cd ${macPath}`)).toEqual(['absolute path into a macOS user folder']);
  expect(whats(`cd ${linuxPath}`)).toEqual(['absolute path into a Linux home folder']);
});

it('flags email addresses but not package names, action versions or the website', () => {
  expect(whats(`contact ${email}`)).toEqual(['email address']);
  expect(whats('"@modelcontextprotocol/sdk": "1.32.2", uses: actions/checkout@v4')).toEqual([]);
  expect(whats('Website: https://stonecut.studio/resources')).toEqual([]);
});

it('flags a local address with any port except the bridge default', () => {
  expect(whats('listening on 127.0.0.1:38790')).toEqual([]);
  expect(whats(['http://localhost', '5173'].join(':'))).toEqual(['local address with a personal port']);
});

it('flags a blocked name as one word, two words or camelCase, and not inside other words', () => {
  const names = new Set(['zebracorn', 'zq']);
  for (const text of ['ZebraCorn', 'zebra corn', 'the zebraCornMod folder', 'zebra-corn', 'ZQ', 'zq_mod']) {
    expect(whats(text, names), text).toEqual(['blocked name']);
  }
  for (const text of ['zebras cornet', 'zqx', 'a zebra', 'Stonecut Bridge']) {
    expect(whats(text, names), text).toEqual([]);
  }
});

it('does not print a blocked name in its findings', () => {
  const [finding] = scanText('ZebraCorn here', new Set(['zebracorn']));
  expect(finding.text).not.toMatch(/zebra/i);
});

#!/usr/bin/env node
// Scans every file git tracks (or would track) for things that point at one person's machine:
// absolute paths into a user folder, email addresses, and local addresses with a port other than the
// bridge's. Exits 1 when it finds any.
//
// Names you never want in the repository (your username, private project names) are NOT kept in the
// repository, because any list stored here, even hashed, would publish them. Give them locally:
//   - one per line in .scan-names.local in the repository folder (git ignores that file), or
//   - comma-separated in the STONECUT_SCAN_NAMES environment variable.
// A name is matched as a whole word, as two neighbouring words ("Some Name"), or as camelCase parts
// ("SomeName", "someNameMod"), ignoring case.
//
//   node scripts/scan-personal.mjs                 scan the repository
//   node scripts/scan-personal.mjs --check "Name"  say whether a word would be caught by the local list

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_NAMES_FILE = '.scan-names.local';

/** The bridge's own default port is the only one that may appear next to a local address. */
const ALLOWED_PORTS = new Set(['38790']);

const RULES = [
  { what: 'absolute path into a Windows user folder', re: /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)[^\\/\s"'`<>)]+/gi },
  { what: 'absolute path into a macOS user folder', re: /(?<![\w.:-])\/Users\/[^/\s"'`<>)]+/g },
  { what: 'absolute path into a Linux home folder', re: /(?<![\w.:-])\/home\/[^/\s"'`<>)]+/g },
  { what: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
];

const LOCAL_PORT = /\b(?:localhost|127\.0\.0\.1):(\d{2,5})\b/g;

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Blocked names from the local file and the environment, squashed to lowercase letters and digits. */
export function localNames(root = repoRoot(), env = process.env) {
  const file = join(root, LOCAL_NAMES_FILE);
  const fromFile = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const fromEnv = (env.STONECUT_SCAN_NAMES ?? '').split(',');
  return new Set([...fromFile, ...fromEnv].map((n) => n.replace(/#.*/, '')).map(squash).filter(Boolean));
}

function words(line) {
  const split = line.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return split.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function blockedName(line, names) {
  if (!names.size) return null;
  const raw = line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const parts = words(line);
  const candidates = [...raw, ...parts, ...parts.slice(1).map((w, i) => parts[i] + w)];
  return candidates.find((c) => names.has(c)) ?? null;
}

/** Findings for one file's text: [{ line, what, text }]. A blocked name itself is never printed. */
export function scanText(text, names = new Set()) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      for (const m of line.matchAll(rule.re)) found.push({ line: i + 1, what: rule.what, text: m[0] });
    }
    for (const m of line.matchAll(LOCAL_PORT)) {
      if (!ALLOWED_PORTS.has(m[1])) found.push({ line: i + 1, what: 'local address with a personal port', text: m[0] });
    }
    if (blockedName(line, names)) found.push({ line: i + 1, what: 'blocked name', text: `(a word on line ${i + 1})` });
  });
  return found;
}

export function repoRoot() {
  return fileURLToPath(new URL('..', import.meta.url));
}

export function trackedFiles(root = repoRoot()) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
}

/** Findings for every tracked file: [{ file, line, what, text }]. Binary files are skipped. */
export function scanRepo(root = repoRoot(), names = localNames(root)) {
  const found = [];
  for (const file of trackedFiles(root)) {
    if (!existsSync(join(root, file))) continue;
    const bytes = readFileSync(join(root, file));
    if (bytes.includes(0)) continue;
    for (const f of scanText(bytes.toString('utf8'), names)) found.push({ file, ...f });
  }
  return found;
}

function main(argv) {
  const at = argv.indexOf('--check');
  if (at >= 0) return void console.log(blockedName(argv[at + 1] ?? '', localNames()) ? 'blocked' : 'not blocked');
  const names = localNames();
  const found = scanRepo(repoRoot(), names);
  for (const f of found) console.log(`${f.file}:${f.line}  ${f.what}: ${f.text}`);
  const local = names.size ? `${names.size} local blocked name(s) checked.` : `No local blocked names (see ${LOCAL_NAMES_FILE}).`;
  console.log(found.length ? `\n${found.length} finding(s). ${local}` : `No personal paths, emails or ports found. ${local}`);
  process.exitCode = found.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));

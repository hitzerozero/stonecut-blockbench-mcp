import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PARENT = join(tmpdir(), 'stonecut-bb-tests');

export function tempDir(label: string): string {
  mkdirSync(PARENT, { recursive: true });
  return mkdtempSync(join(PARENT, `${label}-`));
}

export function writeToken(dir: string, token = 'ab'.repeat(32)): string {
  const file = join(dir, '.stonecut_blockbench_token');
  writeFileSync(file, `${token}\n`);
  return file;
}

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLUGIN_FILE_NAME, assemblePlugin } from '../plugin/assemble.mjs';

// dist/ ships with the npm package. plugin/stonecut_bridge.js is the same file, kept in git and attached
// to each GitHub release, where Blockbench loads it from. A test keeps the copies and the hash in step.
const plugin = assemblePlugin();
mkdirSync(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true });
for (const target of [`../dist/${PLUGIN_FILE_NAME}`, `../plugin/${PLUGIN_FILE_NAME}`]) {
  writeFileSync(new URL(target, import.meta.url), plugin);
  process.stdout.write(`Wrote ${target.slice(3)}\n`);
}
// The SHA-256 people can compare before loading the file. It goes on the release page too.
const sha = createHash('sha256').update(plugin).digest('hex');
writeFileSync(new URL(`../plugin/${PLUGIN_FILE_NAME}.sha256`, import.meta.url), `${sha}  ${PLUGIN_FILE_NAME}\n`);
process.stdout.write(`Wrote plugin/${PLUGIN_FILE_NAME}.sha256\n`);

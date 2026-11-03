import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { PLUGIN_FILE_NAME, assemblePlugin } from '../../plugin/assemble.mjs';
import { pluginPath } from '../../src/cli.js';
import { ALL_TOOLS } from '../../src/server.js';
import { PLUGIN_FILE_NAME as SERVER_PLUGIN_FILE_NAME, VERSION } from '../../src/version.js';
import { PARTS_WITHOUT_REGISTER, blockbenchScopedFs, loadPlugin } from '../helpers/sandbox.js';
import { tempDir } from '../helpers/temp.js';

const nodeRequire = createRequire(import.meta.url);

interface Registered {
  id: string;
  options: Record<string, any>;
  settings: Record<string, any>;
  menu: string[];
}

function runBuiltPlugin(home: string): Registered {
  const found: Registered = { id: '', options: {}, settings: {}, menu: [] };
  const globals = {
    require: (id: string, o?: { scope?: string }) => (id === 'fs' ? blockbenchScopedFs(o?.scope) : nodeRequire(id)), settings: found.settings, SystemInfo: { home_directory: home },
    Plugin: { register: (id: string, options: Record<string, any>) => Object.assign(found, { id, options }) },
    Setting: function (this: any, id: string, o: any) { found.settings[id] ??= { ...o }; this.delete = () => undefined; },
    Action: function (this: any, id: string) { this.id = id; this.delete = () => undefined; },
    MenuBar: { addAction: (a: { id: string }) => found.menu.push(a.id) },
    Blockbench: { showQuickMessage: () => undefined },
  };
  vm.runInContext(assemblePlugin(), vm.createContext(globals));
  return found;
}

it('registers under the id Blockbench takes from the file name', () => {
  const found = runBuiltPlugin(tempDir('home'));
  expect(PLUGIN_FILE_NAME).toBe(`${found.id}.js`);
  expect(SERVER_PLUGIN_FILE_NAME).toBe(PLUGIN_FILE_NAME);
  expect(pluginPath().endsWith(PLUGIN_FILE_NAME)).toBe(true);
  expect(found.options).toMatchObject({ title: 'Stonecut Bridge', author: 'Stonecut Studio', version: VERSION, variant: 'desktop' });
});

it('adds generic settings and a start / stop action when loaded', () => {
  const home = tempDir('home');
  const found = runBuiltPlugin(home);
  found.settings.stonecut_bridge_autostart = { value: false };
  found.options.onload();
  expect(found.settings.stonecut_bridge_port.value).toBe(38790);
  expect(found.settings.stonecut_bridge_output_folder.value).toBe(join(home, 'stonecut-blockbench'));
  expect(found.settings.stonecut_bridge_assets_folder.value).toBe('');
  expect(found.menu).toEqual(['stonecut_bridge_toggle']);
  found.options.onunload();
});

it('has exactly one plugin endpoint per MCP tool', () => {
  const { fn } = loadPlugin(['endpoints'], {}, PARTS_WITHOUT_REGISTER);
  expect(Object.keys(fn.endpoints).sort()).toEqual(ALL_TOOLS.map((t) => t.name).sort());
});

it('keeps the plugin file in git identical to a fresh build, for "Load Plugin from URL"', () => {
  const committed = readFileSync(new URL(`../../plugin/${PLUGIN_FILE_NAME}`, import.meta.url), 'utf8');
  expect(committed === assemblePlugin(), 'run npm run build and commit plugin/stonecut_bridge.js').toBe(true);
});

it('keeps plugin/stonecut_bridge.js.sha256 equal to the SHA-256 of the built plugin', () => {
  const line = readFileSync(new URL(`../../plugin/${PLUGIN_FILE_NAME}.sha256`, import.meta.url), 'utf8');
  expect(line).toBe(`${createHash('sha256').update(assemblePlugin()).digest('hex')}  ${PLUGIN_FILE_NAME}\n`);
});

it('declares every top-level name once across the plugin parts, so no part silently replaces another', () => {
  const names = assemblePlugin().split('\n').map((l) => /^(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z0-9_$]+)/.exec(l)?.[1]).filter(Boolean);
  expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
});

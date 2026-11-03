import { createRequire } from 'node:module';
import vm from 'node:vm';
import { PLUGIN_PARTS, joinParts } from '../../plugin/assemble.mjs';
import { tempDir } from './temp.js';

const nodeRequire = createRequire(import.meta.url);

export const PARTS_WITHOUT_REGISTER = PLUGIN_PARTS.filter((p: string) => p !== 'register');

export interface SandboxOptions {
  home?: string;
  settings?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  /** Leave these functions off the scoped fs, to test what happens when Blockbench lacks one. */
  fsWithout?: string[];
}

export interface Sandbox {
  home: string;
  scopes: string[];
  settings: Record<string, { value: unknown }>;
  fn: Record<string, any>;
}

/**
 * The synchronous functions Blockbench (5.2.2, createScopedFS in native_apis) gives a plugin that asks for
 * require('fs', { scope }). Nothing else exists on that object: no realpathSync, lstatSync or readlinkSync.
 */
export const BLOCKBENCH_FS_SYNC = [
  'accessSync', 'copyFileSync', 'readFileSync', 'writeFileSync', 'appendFileSync', 'existsSync', 'mkdirSync',
  'readdirSync', 'renameSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'statSync',
] as const;

/** A stand-in for Blockbench's scoped fs: the same functions and the same scope check, nothing more. */
export function blockbenchScopedFs(scope?: string, without: string[] = []): Record<string, unknown> {
  const fs = nodeRequire('node:fs') as Record<string, (...a: unknown[]) => unknown>;
  const path = nodeRequire('node:path') as typeof import('node:path');
  const scopePath = scope ? path.resolve(scope) : '';
  const check = (p: unknown) => {
    const full = path.resolve(String(p));
    if (!full.startsWith(scopePath)) throw `Trying to access path "${full}" outside of scoped file system "${scopePath}"`;
  };
  const api: Record<string, unknown> = { scope: scopePath };
  for (const name of BLOCKBENCH_FS_SYNC.filter((n) => !without.includes(n))) {
    api[name] = (...args: unknown[]) => {
      check(args[0]);
      if (name === 'copyFileSync' || name === 'renameSync') check(args[1]);
      return fs[name]!(...args);
    };
  }
  return api;
}

function fakeRequire(scopes: string[], fsWithout: string[] = []) {
  return (id: string, opts?: { scope?: string }) => {
    if (opts?.scope) scopes.push(opts.scope);
    return id === 'fs' ? blockbenchScopedFs(opts?.scope, fsWithout) : nodeRequire(id);
  };
}

function settingsFrom(values: Record<string, unknown>): Record<string, { value: unknown }> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`stonecut_bridge_${k}`, { value: v }]));
}

export function loadPlugin(names: string[], options: SandboxOptions = {}, parts = PARTS_WITHOUT_REGISTER): Sandbox {
  const home = options.home ?? tempDir('home');
  const scopes: string[] = [];
  const settings = settingsFrom(options.settings ?? {});
  const notices = { showQuickMessage: () => undefined, showMessageBox: () => undefined };
  const quiet = { warn: () => undefined, error: () => undefined, log: () => undefined };
  const context = vm.createContext({
    require: fakeRequire(scopes, options.fsWithout), settings, SystemInfo: { home_directory: home }, Blockbench: notices,
    Project: null, Format: null, Formats: {}, console: quiet, setTimeout, clearTimeout, ...options.globals,
  });
  const fn = vm.runInContext(`'use strict';\n${joinParts(parts)}\n;({ ${names.join(', ')} })`, context);
  return { home, scopes, settings, fn };
}

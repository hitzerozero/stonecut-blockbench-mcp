import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { SETTINGS_FILE_NAME } from './settings.js';

export const DEFAULT_PORT = 38790;
export const DEFAULT_TIMEOUT_MS = 180_000;
export const TOKEN_FILE_NAME = '.stonecut_blockbench_token';
export const TOKEN_HEADER = 'X-Stonecut-Token';

export interface BridgeConfig {
  port: number;
  tokenFile: string;
  timeoutMs: number;
}

export interface ServerConfig extends BridgeConfig {
  /** The security settings file, always in the home folder so the plugin reads the same one. */
  settingsFile: string;
  home: string;
}

const blankToUndefined = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const envSchema = z.object({
  STONECUT_BB_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1024).max(65535).optional()),
  STONECUT_BB_TOKEN_FILE: z.preprocess(blankToUndefined, z.string().optional()),
  STONECUT_BB_TIMEOUT_MS: z.preprocess(blankToUndefined, z.coerce.number().int().min(1000).max(3_600_000).optional()),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Bad environment setting:\n${z.prettifyError(parsed.error)}`);
  const e = parsed.data;
  return {
    port: e.STONECUT_BB_PORT ?? DEFAULT_PORT,
    tokenFile: e.STONECUT_BB_TOKEN_FILE ?? join(home, TOKEN_FILE_NAME),
    timeoutMs: e.STONECUT_BB_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
    settingsFile: join(home, SETTINGS_FILE_NAME),
    home,
  };
}

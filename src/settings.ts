import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

/**
 * The security settings file. The person owns it; the Blockbench plugin and this server both read it
 * and refuse anything it does not allow. The plugin is the real fence (it does the reading and writing),
 * the server checks the same limits first so a refused call never reaches Blockbench.
 */
export const SETTINGS_FILE_NAME = '.stonecut_blockbench_config.json';

export const CONFIRM_MODES = ['never', 'overwrite_and_close', 'every_change'] as const;

export type ConfirmMode = (typeof CONFIRM_MODES)[number];

export interface Settings {
  output_folder: string;
  assets_folder: string;
  allow_export: boolean;
  max_texture_size: number;
  max_file_mb: number;
  max_cubes: number;
  confirm: ConfirmMode;
}

export const DEFAULT_SETTINGS: Settings = {
  output_folder: '',
  assets_folder: '',
  allow_export: true,
  max_texture_size: 4096,
  max_file_mb: 16,
  max_cubes: 4096,
  confirm: 'overwrite_and_close',
};

export interface LoadedSettings {
  file: string;
  found: boolean;
  values: Settings;
}

/** Keys people may expect to find, which are fixed on purpose. */
const FIXED_KEYS = ['host', 'bind', 'address', 'listen', 'interface'];

function expandHome(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2));
  return value;
}

function folder(home: string) {
  return z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? '' : expandHome(v, home)))
    .refine((v) => v === '' || isAbsolute(v), 'Use a full folder path, a path starting with "~", or "" for the default')
    .transform((v) => (v === '' ? '' : resolve(v)));
}

function schema(home: string) {
  return z.strictObject({
    output_folder: folder(home).default(''),
    assets_folder: folder(home).default(''),
    allow_export: z.boolean().default(DEFAULT_SETTINGS.allow_export),
    max_texture_size: z.number().int().min(16).max(4096).default(DEFAULT_SETTINGS.max_texture_size),
    max_file_mb: z.number().int().min(1).max(256).default(DEFAULT_SETTINGS.max_file_mb),
    max_cubes: z.number().int().min(1).max(65536).default(DEFAULT_SETTINGS.max_cubes),
    confirm: z.enum(CONFIRM_MODES).default(DEFAULT_SETTINGS.confirm),
  });
}

export function parseSettings(text: string | null, file: string, home: string): Settings {
  if (text === null) return { ...DEFAULT_SETTINGS };
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`Settings file ${file} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const fixed = Object.keys(json).find((k) => FIXED_KEYS.includes(k));
    if (fixed) throw new Error(`Settings file ${file}: "${fixed}" cannot be set. The bridge always listens on 127.0.0.1 only.`);
  }
  const parsed = schema(home).safeParse(json);
  if (!parsed.success) throw new Error(`Settings file ${file} has a bad value:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

function missing(e: unknown): boolean {
  return (e as { code?: string }).code === 'ENOENT';
}

export async function readSettings(file: string, home: string): Promise<LoadedSettings> {
  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    if (!missing(e)) throw new Error(`Cannot read settings file ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { file, found: text !== null, values: parseSettings(text, file, home) };
}

export function readSettingsSync(file: string, home: string): LoadedSettings {
  let text: string | null = null;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    if (!missing(e)) throw e;
  }
  return { file, found: text !== null, values: parseSettings(text, file, home) };
}

export type SettingsSource = () => Promise<LoadedSettings>;

export const defaultsOnly: SettingsSource = async () => ({ file: SETTINGS_FILE_NAME, found: false, values: { ...DEFAULT_SETTINGS } });

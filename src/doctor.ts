import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BridgeError, type Bridge } from './bridge.js';
import type { ServerConfig } from './config.js';
import { pingReply, statusReply } from './replies.js';
import { readSettings, type Settings } from './settings.js';
import { STUDIO_LINE, VERSION } from './version.js';

export interface Check {
  ok: boolean;
  label: string;
  fix?: string;
}

export interface DoctorContext {
  config: ServerConfig;
  bridge: Bridge;
  nodeVersion: string;
}

const MIN_NODE = 20;
const OUTPUT_FOLDER_NAME = 'stonecut-blockbench';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const MAX_UNTRUSTED = 160;

/** Text the bridge sent: control characters removed, shortened. Never a command to follow. */
export function clean(text: string, max = MAX_UNTRUSTED): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

/** An error message: cleaned always, and marked when it carries text the bridge sent. */
function errorText(e: unknown): string {
  return e instanceof BridgeError && e.fromBridge ? untrusted(message(e)) : `(${clean(message(e), 400)})`;
}

/** Bridge-supplied text, cleaned and marked so nobody mistakes it for advice from doctor. */
export function untrusted(text: string): string {
  return `[text from the bridge, not checked: "${clean(text)}"]`;
}

export function checkNode(version: string): Check {
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? 0);
  return major >= MIN_NODE
    ? { ok: true, label: `Node.js ${version} (needs ${MIN_NODE} or newer)` }
    : { ok: false, label: `Node.js ${version} is too old (needs ${MIN_NODE} or newer)`, fix: 'Install the LTS version from https://nodejs.org and open a new terminal.' };
}

async function checkSettings(config: ServerConfig): Promise<{ check: Check; values: Settings | null }> {
  try {
    const s = await readSettings(config.settingsFile, config.home);
    const where = s.found ? `Settings file ${config.settingsFile} is valid.` : `No settings file at ${config.settingsFile}; the defaults are in use.`;
    return { check: { ok: true, label: `${where} In use: ${JSON.stringify(s.values)}` }, values: s.values };
  } catch (e) {
    return {
      check: { ok: false, label: message(e), fix: 'Fix that value in the file, or delete the file to use the defaults. Until then the bridge and the server refuse every request.' },
      values: null,
    };
  }
}

export function checkToken(file: string): Check {
  if (!existsSync(file)) {
    return { ok: false, label: `No token file at ${file}`, fix: 'Open Blockbench with the Stonecut Bridge plugin loaded; it writes the token when it first starts.' };
  }
  const valid = /^[0-9a-f]{64}$/.test(readFileSync(file, 'utf8').trim());
  return valid
    ? { ok: true, label: `Token file ${file} holds a valid token` }
    : { ok: false, label: `Token file ${file} does not hold a valid token`, fix: 'Delete the file, then in Blockbench use Tools > Stonecut Bridge: start / stop twice to write a new one.' };
}

function nearestExisting(dir: string): string {
  let d = dir;
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  return d;
}

function writable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function checkOutputFolder(dir: string, source: string): Check {
  const pick = 'Set "output_folder" in the settings file (or the Blockbench setting) to a folder you can write to.';
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) return { ok: false, label: `Output folder ${dir} (${source}) is a file, not a folder`, fix: pick };
    return writable(dir)
      ? { ok: true, label: `Output folder ${dir} (${source}) exists and is writable` }
      : { ok: false, label: `Output folder ${dir} (${source}) is not writable`, fix: pick };
  }
  const parent = nearestExisting(dir);
  return writable(parent)
    ? { ok: true, label: `Output folder ${dir} (${source}) does not exist yet; the bridge creates it on the first screenshot or export` }
    : { ok: false, label: `Output folder ${dir} (${source}) does not exist and ${parent} is not writable`, fix: pick };
}

/** Every check, in order. Only reads files and calls the read-only ping and status endpoints. */
export async function runDoctor(ctx: DoctorContext): Promise<Check[]> {
  const { config, bridge } = ctx;
  const checks: Check[] = [checkNode(ctx.nodeVersion)];
  const settings = await checkSettings(config);
  checks.push(settings.check);
  const token = checkToken(config.tokenFile);
  checks.push(token);

  let pluginVersion: string | null = null;
  let status: { geckolib_plugin_installed: boolean; roots: { output: string } } | null = null;
  if (token.ok) {
    try {
      pluginVersion = (await bridge.call('ping', {}, pingReply)).version;
      checks.push({ ok: true, label: `The bridge answers on 127.0.0.1:${config.port}` });
    } catch (e) {
      checks.push({
        ok: false,
        label: `The bridge does not answer on 127.0.0.1:${config.port} ${errorText(e)}`,
        fix: `Open Blockbench and load the plugin (README, Setup). Check that "Stonecut Bridge: port" in Blockbench (File > Preferences > Settings > General) is ${config.port}, or set STONECUT_BB_PORT to match it.`,
      });
    }
    if (pluginVersion !== null) {
      try {
        status = await bridge.call('status', {}, statusReply);
      } catch (e) {
        checks.push({ ok: false, label: `The bridge answered ping but not status ${errorText(e)}`, fix: 'Restart the bridge in Blockbench (Tools > Stonecut Bridge: start / stop) and run doctor again.' });
      }
    }
  } else {
    checks.push({ ok: false, label: `The bridge on 127.0.0.1:${config.port} was not checked, because there is no valid token`, fix: 'Fix the token first (see above).' });
  }

  if (pluginVersion === null) {
    checks.push({ ok: false, label: 'Plugin version not checked, because the bridge did not answer', fix: 'Get the bridge answering first (see above).' });
  } else if (pluginVersion === VERSION) {
    checks.push({ ok: true, label: `Plugin version ${pluginVersion} matches the server version ${VERSION}` });
  } else {
    checks.push({ ok: false, label: `Plugin version ${untrusted(pluginVersion)} differs from the server version ${VERSION}`, fix: 'Load the plugin for this server version (README, Setup) and restart Blockbench, or use the server version that matches the plugin.' });
  }

  if (status === null) {
    checks.push({ ok: false, label: 'GeckoLib plugin not checked, because the bridge gave no status', fix: 'Get the bridge answering first (see above).' });
  } else if (status.geckolib_plugin_installed) {
    checks.push({ ok: true, label: 'The GeckoLib plugin is installed in Blockbench' });
  } else {
    checks.push({ ok: false, label: 'The GeckoLib plugin is not installed in Blockbench (needed for mobs, not for Java items)', fix: 'In Blockbench: File > Plugins > Available, install "GeckoLib Models & Animations".' });
  }

  const fallback = settings.values?.output_folder || join(config.home, OUTPUT_FOLDER_NAME);
  checks.push(status
    ? checkOutputFolder(clean(status.roots.output, 1024), 'reported by the bridge')
    : checkOutputFolder(fallback, settings.values?.output_folder ? 'from the settings file' : 'the default; the Blockbench setting may differ'));
  return checks;
}

export function formatChecks(checks: Check[]): string {
  const lines = checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.label}${c.ok || !c.fix ? '' : `\n      Fix: ${c.fix}`}`);
  const failed = checks.filter((c) => !c.ok).length;
  return `${lines.join('\n')}\n\n${failed ? `${failed} of ${checks.length} checks failed.` : `All ${checks.length} checks passed.`}\n${STUDIO_LINE}`;
}

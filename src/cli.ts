import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { DEFAULT_SETTINGS, readSettingsSync } from './settings.js';
import { PLUGIN_FILE_NAME, VERSION } from './version.js';

export const HELP = `stonecut-blockbench-mcp ${VERSION}

Without options it runs the MCP server on stdio (an MCP client starts it for you).

Commands:
  install         Add the server and the skill to Claude Code. Shows what it will do and asks first.
  uninstall       Remove both again. Shows what it will do and asks first.
  doctor          Check Node, the settings file, the token, the bridge, the plugin and the output
                  folder, and say how to fix what fails. Changes nothing.
  Add --yes to install or uninstall to skip the question, or --dry-run to only show the plan.

Options:
  --plugin-path   Print the full path of the Blockbench plugin file to load into Blockbench.
  --config        Print where the security settings file is and the settings in use.
  --init-config   Create the security settings file with the default values, if it does not exist yet.
  --version       Print the version.
  --help          Print this help.

Environment:
  STONECUT_BB_PORT         Bridge port (default 38790). Must match the plugin setting.
  STONECUT_BB_TOKEN_FILE   Token file (default .stonecut_blockbench_token in your home folder).
  STONECUT_BB_TIMEOUT_MS   How long to wait for Blockbench per call (default 180000).`;

export function pluginPath(): string {
  return fileURLToPath(new URL(`./${PLUGIN_FILE_NAME}`, import.meta.url));
}

export function showSettings(file: string, home: string): string {
  try {
    const s = readSettingsSync(file, home);
    const where = s.found ? `Settings file: ${file}` : `No settings file yet at ${file}; the defaults below are in use.`;
    return `${where}\n${JSON.stringify(s.values, null, 2)}`;
  } catch (e) {
    return `${e instanceof Error ? e.message : String(e)}\nUntil this is fixed, the bridge and the server refuse every request.`;
  }
}

export function initSettings(file: string): string {
  try {
    writeFileSync(file, `${JSON.stringify(DEFAULT_SETTINGS, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return `Created ${file} with the default settings. Edit it with any text editor.`;
  } catch (e) {
    if ((e as { code?: string }).code === 'EEXIST') return `${file} already exists; left unchanged.`;
    throw e;
  }
}

export function cliAnswer(argv: string[]): string | null {
  if (argv.includes('--plugin-path')) return pluginPath();
  if (argv.includes('--config')) {
    const c = loadConfig();
    return showSettings(c.settingsFile, c.home);
  }
  if (argv.includes('--init-config')) return initSettings(loadConfig().settingsFile);
  if (argv.includes('--version')) return VERSION;
  if (argv.includes('--help') || argv.includes('-h')) return HELP;
  return null;
}

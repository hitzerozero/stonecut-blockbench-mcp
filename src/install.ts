import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { readSettingsSync } from './settings.js';
import { SERVER_NAME, STUDIO_LINE, VERSION } from './version.js';

export const PACKAGE_NAME = 'stonecut-blockbench-mcp';
/** The package at exactly this version, so Claude Code never silently runs newer code. */
export const PINNED_PACKAGE = `${PACKAGE_NAME}@${VERSION}`;
/** The plugin file attached to this version's GitHub release. Blockbench downloads URL plugins at every start, so it must not move. */
export const PLUGIN_URL = `https://github.com/hitzerozero/stonecut-blockbench-mcp/releases/download/v${VERSION}/stonecut_bridge.js`;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a program and waits for it. Tests pass a fake one, so nothing real is started. */
export type Runner = (cmd: string, args: string[]) => RunResult;

function quoteForCmd(arg: string): string {
  return /^[A-Za-z0-9_@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

/**
 * The full path of a program from PATH. Only absolute PATH entries count, so a file with the same name
 * in the current folder (cmd.exe would run claude.bat from there) is never picked.
 */
export function findOnPath(cmd: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform, exists: (p: string) => boolean = existsSync): string | null {
  const P = platform === 'win32' ? win32 : posix;
  const dirs = (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').map((d) => d.trim().replace(/^"(.*)"$/, '$1'));
  const exts = platform === 'win32' ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const dir of dirs.filter((d) => d && P.isAbsolute(d) && !(platform === 'win32' && /^[\\/][^\\/]/.test(d)))) {
    for (const ext of exts) {
      const full = P.join(dir, cmd + ext.toLowerCase());
      if (exists(full)) return full;
    }
  }
  return null;
}

export const realRunner: Runner = (cmd, args) => {
  const full = findOnPath(cmd, process.env, process.platform);
  if (!full) return { status: null, stdout: '', stderr: `${cmd} was not found on PATH` };
  const env: NodeJS.ProcessEnv = { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' };
  // A .cmd or .bat file only starts through cmd.exe; it gets its full path, so cmd.exe does not search.
  const r = /\.(cmd|bat)$/i.test(full)
    ? spawnSync(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${[full, ...args].map(quoteForCmd).join(' ')}"`], { encoding: 'utf8', env, windowsVerbatimArguments: true })
    : spawnSync(full, args, { encoding: 'utf8', env });
  return { status: r.error ? null : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? (r.error?.message ?? '') };
};

export interface InstallContext {
  platform: NodeJS.Platform;
  /** Claude Code's folder: CLAUDE_CONFIG_DIR, or .claude in the home folder. */
  claudeDir: string;
  /** The folder that holds package.json, dist/ and skills/. */
  packageRoot: string;
  /** Running from a git clone (src/ is there) rather than from the npm package. */
  fromSource: boolean;
  run: Runner;
  home: string;
  /** The bridge's token file: STONECUT_BB_TOKEN_FILE, or .stonecut_blockbench_token in the home folder. */
  tokenFile: string;
  /** The security settings file, always .stonecut_blockbench_config.json in the home folder. */
  settingsFile: string;
}

export function packageRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

export function contextFor(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, home: string, root: string, run: Runner): InstallContext {
  const claudeDir = env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');
  const config = loadConfig(env, home);
  return {
    platform, claudeDir, packageRoot: root, fromSource: existsSync(join(root, 'src', 'index.ts')), run,
    home, tokenFile: config.tokenFile, settingsFile: config.settingsFile,
  };
}

/** The command Claude Code will start for the server. */
export function serverCommand(ctx: InstallContext): string[] {
  if (ctx.fromSource) return ['node', join(ctx.packageRoot, 'dist', 'index.js')];
  const npx = ['npx', '-y', PINNED_PACKAGE];
  return ctx.platform === 'win32' ? ['cmd', '/c', ...npx] : npx;
}

export function addArgs(ctx: InstallContext): string[] {
  return ['mcp', 'add', '--scope', 'user', SERVER_NAME, '--', ...serverCommand(ctx)];
}

export const REMOVE_ARGS = ['mcp', 'remove', '--scope', 'user', SERVER_NAME];

export function claudeFound(ctx: InstallContext): boolean {
  return ctx.run('claude', ['--version']).status === 0;
}

function serverAdded(ctx: InstallContext): boolean {
  return ctx.run('claude', ['mcp', 'get', SERVER_NAME]).status === 0;
}

export type Action =
  | { kind: 'run'; say: string; cmd: string; args: string[] }
  | { kind: 'copy'; say: string; from: string; to: string }
  | { kind: 'remove'; say: string; path: string }
  | { kind: 'rmdir'; say: string; path: string };

export interface Plan {
  actions: Action[];
  notes: string[];
}

function skillSource(ctx: InstallContext): string {
  return join(ctx.packageRoot, 'skills', 'blockbench');
}

export function skillTarget(ctx: InstallContext): string {
  return join(ctx.claudeDir, 'skills', 'blockbench');
}

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}

function sameFile(a: string, b: string): boolean {
  return existsSync(b) && readFileSync(a).equals(readFileSync(b));
}

function shown(cmd: string, args: string[]): string {
  return [cmd, ...args].map(quoteForCmd).join(' ');
}

/** What install would do. Only asks Claude Code questions (version, is the server there); changes nothing. */
export function planInstall(ctx: InstallContext): Plan {
  const plan: Plan = { actions: [], notes: [] };
  if (serverAdded(ctx)) plan.notes.push(`Claude Code already has the ${SERVER_NAME} server; it is left as it is.`);
  else plan.actions.push({ kind: 'run', say: `Add the ${SERVER_NAME} server to Claude Code for all projects`, cmd: 'claude', args: addArgs(ctx) });
  const src = skillSource(ctx), dest = skillTarget(ctx);
  const copies = filesIn(src).map((from) => ({ from, to: join(dest, relative(src, from)) })).filter((c) => !sameFile(c.from, c.to));
  for (const c of copies) {
    if (existsSync(c.to)) plan.actions.push({ kind: 'copy', say: 'Back up the skill file that is there now', from: c.to, to: backupName(c.to) });
    plan.actions.push({ kind: 'copy', say: `${existsSync(c.to) ? 'Update' : 'Copy'} the skill file`, ...c });
  }
  if (!copies.length) plan.notes.push(`The skill is already installed in ${dest}.`);
  return plan;
}

/** A free name next to the file, such as SKILL.md.backup-20261103-142501. */
export function backupName(file: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  let name = `${file}.backup-${stamp}`;
  for (let i = 2; existsSync(name); i++) name = `${file}.backup-${stamp}-${i}`;
  return name;
}

/** What uninstall would do: the reverse of install. Changes nothing. */
export function planUninstall(ctx: InstallContext): Plan {
  const plan: Plan = { actions: [], notes: [] };
  if (!claudeFound(ctx)) plan.notes.push(`Claude Code was not found, so there is no ${SERVER_NAME} server to remove there.`);
  else if (serverAdded(ctx)) plan.actions.push({ kind: 'run', say: `Remove the ${SERVER_NAME} server from Claude Code`, cmd: 'claude', args: REMOVE_ARGS });
  else plan.notes.push(`Claude Code has no ${SERVER_NAME} server.`);
  planSkillRemoval(ctx, plan);
  planDataRemoval(ctx, plan);
  return plan;
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** The output folder the person's models are in, for the "kept" note. Only reads. */
function outputFolderNote(ctx: InstallContext): string {
  let chosen = '';
  try {
    chosen = readSettingsSync(ctx.settingsFile, ctx.home).values.output_folder;
  } catch {
    // A broken settings file still gets deleted; the note then falls back to the default folder.
  }
  const where = chosen || `${join(ctx.home, 'stonecut-blockbench')} (unless you chose another folder in Blockbench)`;
  return `Kept on purpose: your output folder ${where} and your assets folder, if you set one. They hold your models; delete them by hand if you want.`;
}

/**
 * The token file and the settings file: only those exact files at those exact paths. The token file is
 * deleted only when it holds a token, so a mistyped STONECUT_BB_TOKEN_FILE can never delete another file.
 */
function planDataRemoval(ctx: InstallContext, plan: Plan): void {
  plan.notes.push(outputFolderNote(ctx));
  if (isFile(ctx.settingsFile)) plan.actions.push({ kind: 'remove', say: 'Delete the security settings file', path: ctx.settingsFile });
  else plan.notes.push(`No settings file at ${ctx.settingsFile}.`);
  if (!isFile(ctx.tokenFile)) {
    plan.notes.push(`No token file at ${ctx.tokenFile}.`);
  } else if (/^[0-9a-f]{64}$/.test(readFileSync(ctx.tokenFile, 'utf8').trim())) {
    plan.actions.push({ kind: 'remove', say: 'Delete the bridge token file', path: ctx.tokenFile });
  } else {
    plan.notes.push(`${ctx.tokenFile} does not hold a bridge token, so it is kept.`);
  }
}

function planSkillRemoval(ctx: InstallContext, plan: Plan): void {
  const src = skillSource(ctx), dest = skillTarget(ctx);
  const present = existsSync(dest) ? filesIn(src).map((from) => ({ from, to: join(dest, relative(src, from)) })).filter((p) => existsSync(p.to)) : [];
  if (!present.length) {
    plan.notes.push(`No Stonecut skill in ${dest}.`);
    return;
  }
  // Only files that are exactly what this version shipped are deleted; anything changed is kept.
  const removed = present.filter((p) => sameFile(p.from, p.to)).map((p) => p.to);
  for (const p of present.filter((x) => !removed.includes(x.to))) plan.notes.push(`${p.to} is not the file this version installed (it may have been changed); it is kept.`);
  for (const path of removed) plan.actions.push({ kind: 'remove', say: 'Delete the skill file', path });
  const others = filesIn(dest).filter((f) => !removed.includes(f));
  if (others.length) plan.notes.push(`${dest} also holds other files; the folder is kept.`);
  else plan.actions.push({ kind: 'rmdir', say: 'Delete the empty skill folder', path: dest });
}

export function describe(action: Action): string {
  switch (action.kind) {
    case 'run': return `${action.say}:\n     ${shown(action.cmd, action.args)}`;
    case 'copy': return `${action.say}:\n     ${action.from}\n     to ${action.to}`;
    default: return `${action.say}:\n     ${action.path}`;
  }
}

export function execute(plan: Plan, ctx: InstallContext): void {
  for (const a of plan.actions) {
    if (a.kind === 'run') {
      const r = ctx.run(a.cmd, a.args);
      if (r.status !== 0) throw new Error(`"${shown(a.cmd, a.args)}" failed: ${(r.stderr || r.stdout).trim() || `exit ${r.status}`}`);
    } else if (a.kind === 'copy') {
      mkdirSync(dirname(a.to), { recursive: true });
      copyFileSync(a.from, a.to);
    } else if (a.kind === 'remove') {
      rmSync(a.path);
    } else {
      rmdirSync(a.path);
    }
  }
}

export function pluginSteps(): string {
  return [
    'In Blockbench: File > Plugins, click "Load Plugin from URL" and paste:',
    `  ${PLUGIN_URL}`,
    'Blockbench asks for permissions; allow them. You then see "Stonecut Bridge listening on 127.0.0.1:38790".',
  ].join('\n');
}

export function manualSteps(ctx: InstallContext): string {
  return [
    'Claude Code was not found (the "claude" command did not answer).',
    'Install it from https://claude.com/claude-code, then run this again. Or set things up by hand:',
    '',
    '1. Add the server to Claude Code:',
    `     ${shown('claude', addArgs(ctx))}`,
    `2. Copy the folder ${skillSource(ctx)}`,
    `   to ${skillTarget(ctx)}`,
    `3. ${pluginSteps().replace(/\n/g, '\n   ')}`,
  ].join('\n');
}

export type Mode = 'install' | 'uninstall';

export interface Io {
  ask(question: string): Promise<string>;
  say(text: string): void;
}

export interface InstallOptions {
  /** Skip the question: the person already said yes (for example to their agent). */
  yes?: boolean;
  /** Only print the plan. Changes nothing and asks nothing. */
  dryRun?: boolean;
}

/** Shows the plan, asks y/n, and changes things only after a yes. Returns the exit code. */
export async function runInstall(mode: Mode, ctx: InstallContext, io: Io, options: InstallOptions = {}): Promise<number> {
  if (mode === 'install' && !claudeFound(ctx)) {
    io.say(manualSteps(ctx));
    return 1;
  }
  const plan = mode === 'install' ? planInstall(ctx) : planUninstall(ctx);
  for (const note of plan.notes) io.say(note);
  if (!plan.actions.length) {
    io.say(mode === 'install' ? 'Nothing to change; it is already installed.' : 'Nothing to remove.');
    if (mode === 'install') io.say(`\n${pluginSteps()}`);
    return 0;
  }
  io.say(`\nThis will:\n${plan.actions.map((a, i) => `  ${i + 1}. ${describe(a)}`).join('\n')}\n`);
  if (options.dryRun) {
    io.say(`Dry run: nothing changed. Run it again without --dry-run (or with --yes) to do this.`);
    return 0;
  }
  const answer = options.yes ? 'y' : await io.ask('Go ahead? [y/N] ');
  if (!/^\s*y(es)?\s*$/i.test(answer)) {
    io.say('Nothing changed.');
    return 1;
  }
  execute(plan, ctx);
  io.say(mode === 'install' ? 'Done. Claude Code has the server and the skill.' : 'Done. Removed what is listed above.');
  if (mode === 'install') io.say(`\n${pluginSteps()}\nThen start Claude Code and type /mcp: it lists ${SERVER_NAME} as connected.\n\n${STUDIO_LINE}`);
  return 0;
}

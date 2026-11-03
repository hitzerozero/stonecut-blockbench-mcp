import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  REMOVE_ARGS, contextFor, packageRoot, planInstall, runInstall, skillTarget,
  type InstallContext, type Io, type RunResult, type Runner,
} from '../src/install.js';
import { HELP } from '../src/cli.js';
import { STUDIO_LINE, VERSION } from '../src/version.js';
import { tempDir } from './helpers/temp.js';

const OK: RunResult = { status: 0, stdout: '', stderr: '' };
const SKILL = readFileSync(join(packageRoot(), 'skills', 'blockbench', 'SKILL.md'));

/** A stand-in for the claude command that remembers whether the server was added. Nothing real runs. */
function fakeClaude(options: { found?: boolean; added?: boolean; addFails?: boolean } = {}) {
  const calls: string[][] = [];
  let added = options.added ?? false;
  const run: Runner = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (options.found === false) return { status: null, stdout: '', stderr: 'not found' };
    if (args[0] === '--version') return OK;
    if (args[0] === 'mcp' && args[1] === 'get') return { ...OK, status: added ? 0 : 1 };
    if (args[0] === 'mcp' && args[1] === 'add') {
      if (options.addFails) return { status: 1, stdout: '', stderr: 'add failed' };
      added = true;
      return OK;
    }
    if (args[0] === 'mcp' && args[1] === 'remove') {
      added = false;
      return OK;
    }
    return { status: 1, stdout: '', stderr: 'unknown' };
  };
  const changing = () => calls.filter((c) => c[2] === 'add' || c[2] === 'remove');
  return { run, calls, changing, isAdded: () => added };
}

function setup(options: Parameters<typeof fakeClaude>[0] = {}, platform: NodeJS.Platform = 'linux') {
  const claude = fakeClaude(options);
  const claudeDir = join(tempDir('claude'), '.claude');
  const ctx = contextFor({ CLAUDE_CONFIG_DIR: claudeDir }, platform, tempDir('home'), packageRoot(), claude.run);
  return { claude, ctx, claudeDir };
}

function io(answer: string) {
  const said: string[] = [];
  let asked = 0;
  const value: Io = { ask: async () => { asked++; return answer; }, say: (t) => said.push(t) };
  return { io: value, said, asked: () => asked, text: () => said.join('\n') };
}

const npx = (ctx: InstallContext): InstallContext => ({ ...ctx, fromSource: false });
const addCommand = (ctx: InstallContext) => planInstall(ctx).actions.find((a) => a.kind === 'run');

it('plans the right claude mcp add command for Windows, macOS, Linux and a source checkout, running nothing that changes anything', () => {
  for (const [platform, server] of [
    ['win32', ['cmd', '/c', 'npx', '-y', `stonecut-blockbench-mcp@${VERSION}`]],
    ['darwin', ['npx', '-y', `stonecut-blockbench-mcp@${VERSION}`]],
    ['linux', ['npx', '-y', `stonecut-blockbench-mcp@${VERSION}`]],
  ] as const) {
    const { ctx, claude } = setup({}, platform);
    expect(addCommand(npx(ctx)), platform).toMatchObject({
      cmd: 'claude', args: ['mcp', 'add', '--scope', 'user', 'stonecut-blockbench', '--', ...server],
    });
    expect(claude.changing()).toEqual([]);
  }
  const { ctx } = setup();
  expect(ctx.fromSource).toBe(true);
  expect(addCommand(ctx)).toMatchObject({ args: ['mcp', 'add', '--scope', 'user', 'stonecut-blockbench', '--', 'node', join(packageRoot(), 'dist', 'index.js')] });
});

it('puts the skill in CLAUDE_CONFIG_DIR, or in .claude in the home folder', () => {
  const { ctx, claudeDir } = setup();
  expect(skillTarget(ctx)).toBe(join(claudeDir, 'skills', 'blockbench'));
  const home = tempDir('home');
  expect(skillTarget(contextFor({}, 'linux', home, packageRoot(), fakeClaude().run))).toBe(join(home, '.claude', 'skills', 'blockbench'));
});

it('changes nothing unless the answer is yes', async () => {
  for (const answer of ['n', '', 'no', 'maybe']) {
    const { ctx, claude, claudeDir } = setup();
    const t = io(answer);
    expect(await runInstall('install', ctx, t.io), answer).toBe(1);
    expect(t.asked()).toBe(1);
    expect(t.text()).toMatch(/This will:[\s\S]*claude mcp add --scope user stonecut-blockbench[\s\S]*Nothing changed\./);
    expect(claude.changing()).toEqual([]);
    expect(existsSync(claudeDir)).toBe(false);
  }
});

it('adds the server and copies the skill after a yes, then prints the plugin step', async () => {
  const { ctx, claude } = setup();
  const t = io('y');
  expect(await runInstall('install', ctx, t.io)).toBe(0);
  expect(claude.changing()).toEqual([['claude', ...addCommand({ ...ctx, run: fakeClaude().run })!.args]]);
  expect(readFileSync(join(skillTarget(ctx), 'SKILL.md')).equals(SKILL)).toBe(true);
  expect(t.text()).toContain(`github.com/hitzerozero/stonecut-blockbench-mcp/releases/download/v${VERSION}/stonecut_bridge.js`);
});

it('gives the same result when run twice, without asking again', async () => {
  const { ctx, claude } = setup();
  await runInstall('install', ctx, io('y').io);
  const second = io('y');
  expect(await runInstall('install', ctx, second.io)).toBe(0);
  expect(second.asked()).toBe(0);
  expect(second.text()).toMatch(/already has the stonecut-blockbench server[\s\S]*already installed/);
  expect(claude.changing()).toHaveLength(1);
  expect(readdirSync(skillTarget(ctx))).toEqual(['SKILL.md']);
});

it('backs up a changed skill file before updating it', async () => {
  const { ctx } = setup({ added: true });
  mkdirSync(skillTarget(ctx), { recursive: true });
  writeFileSync(join(skillTarget(ctx), 'SKILL.md'), 'old text');
  const plan = planInstall(ctx);
  expect(plan.actions.map((a) => a.say)).toEqual(['Back up the skill file that is there now', 'Update the skill file']);
  await runInstall('install', ctx, io('yes').io);
  expect(readFileSync(join(skillTarget(ctx), 'SKILL.md')).equals(SKILL)).toBe(true);
  const backups = readdirSync(skillTarget(ctx)).filter((f) => f.startsWith('SKILL.md.backup-'));
  expect(backups).toHaveLength(1);
  expect(readFileSync(join(skillTarget(ctx), backups[0]!), 'utf8')).toBe('old text');
});

it('uninstall keeps a skill file that differs from the shipped one, even when it is named blockbench', async () => {
  const { ctx } = setup();
  await runInstall('install', ctx, io('y').io);
  const edited = `${SKILL.toString('utf8')}\nMy own notes.\n`;
  writeFileSync(join(skillTarget(ctx), 'SKILL.md'), edited);
  const t = io('y');
  await runInstall('uninstall', ctx, t.io);
  expect(t.text()).toMatch(/is not the file this version installed/);
  expect(readFileSync(join(skillTarget(ctx), 'SKILL.md'), 'utf8')).toBe(edited);
});

it('uninstall removes the server and the skill after a yes, and the second time has nothing to do', async () => {
  const { ctx, claude } = setup();
  await runInstall('install', ctx, io('y').io);
  const no = io('n');
  expect(await runInstall('uninstall', ctx, no.io)).toBe(1);
  expect(claude.isAdded()).toBe(true);
  expect(existsSync(skillTarget(ctx))).toBe(true);
  const yes = io('y');
  expect(await runInstall('uninstall', ctx, yes.io)).toBe(0);
  expect(claude.changing().at(-1)).toEqual(['claude', ...REMOVE_ARGS]);
  expect(claude.isAdded()).toBe(false);
  expect(existsSync(skillTarget(ctx))).toBe(false);
  const again = io('y');
  expect(await runInstall('uninstall', ctx, again.io)).toBe(0);
  expect(again.asked()).toBe(0);
  expect(again.text()).toMatch(/Nothing to remove/);
});

it('uninstall keeps other files in the skill folder and never touches a skill that is not ours', async () => {
  const { ctx } = setup();
  await runInstall('install', ctx, io('y').io);
  writeFileSync(join(skillTarget(ctx), 'notes.md'), 'mine');
  await runInstall('uninstall', ctx, io('y').io);
  expect(readdirSync(skillTarget(ctx))).toEqual(['notes.md']);

  const other = setup();
  mkdirSync(skillTarget(other.ctx), { recursive: true });
  writeFileSync(join(skillTarget(other.ctx), 'SKILL.md'), '---\nname: something-else\n---\n');
  const t = io('y');
  expect(await runInstall('uninstall', other.ctx, t.io)).toBe(0);
  expect(t.asked()).toBe(0);
  expect(readFileSync(join(skillTarget(other.ctx), 'SKILL.md'), 'utf8')).toMatch(/something-else/);
});

it('prints the manual steps and changes nothing when Claude Code is not found', async () => {
  const { ctx, claude, claudeDir } = setup({ found: false });
  const t = io('y');
  expect(await runInstall('install', ctx, t.io)).toBe(1);
  expect(t.asked()).toBe(0);
  expect(claude.calls).toEqual([['claude', '--version']]);
  expect(t.text()).toMatch(/Claude Code was not found[\s\S]*claude mcp add --scope user stonecut-blockbench[\s\S]*skills[\s\S]*Load Plugin from URL/);
  expect(existsSync(claudeDir)).toBe(false);
});

it('stops with the error when claude mcp add fails', async () => {
  const { ctx } = setup({ addFails: true });
  await expect(runInstall('install', ctx, io('y').io)).rejects.toThrow('add failed');
});

it('with --dry-run shows the plan and changes nothing, without asking', async () => {
  const { ctx, claude, claudeDir } = setup();
  const t = io('y');
  expect(await runInstall('install', ctx, t.io, { dryRun: true })).toBe(0);
  expect(t.asked()).toBe(0);
  expect(t.text()).toMatch(/This will:[\s\S]*claude mcp add --scope user stonecut-blockbench[\s\S]*Dry run: nothing changed/);
  expect(claude.changing()).toEqual([]);
  expect(existsSync(claudeDir)).toBe(false);
});

it('with --yes goes ahead without asking', async () => {
  const { ctx, claude } = setup();
  const t = io('n');
  expect(await runInstall('install', ctx, t.io, { yes: true })).toBe(0);
  expect(t.asked()).toBe(0);
  expect(claude.isAdded()).toBe(true);
});

// ---- Complete cleanup: the token file and the settings file, never the person's models ----

const TOKEN = 'ab'.repeat(32);

function withData(options: Parameters<typeof fakeClaude>[0] = {}, env: Record<string, string> = {}) {
  const claude = fakeClaude(options);
  const home = tempDir('home');
  const claudeDir = join(home, '.claude');
  const ctx = contextFor({ CLAUDE_CONFIG_DIR: claudeDir, ...env }, 'linux', home, packageRoot(), claude.run);
  const models = join(home, 'stonecut-blockbench');
  mkdirSync(models, { recursive: true });
  writeFileSync(join(models, 'wolf.geo.json'), '{}');
  return { claude, ctx, home, models };
}

it('uninstall deletes the token and settings files after a yes, and keeps the output folder', async () => {
  const { ctx, home, models } = withData();
  writeFileSync(join(home, '.stonecut_blockbench_token'), `${TOKEN}\n`);
  writeFileSync(join(home, '.stonecut_blockbench_config.json'), '{"allow_export": false}');
  const t = io('y');
  expect(await runInstall('uninstall', ctx, t.io)).toBe(0);
  expect(t.text()).toContain(`Delete the security settings file:\n     ${join(home, '.stonecut_blockbench_config.json')}`);
  expect(t.text()).toContain(`Delete the bridge token file:\n     ${join(home, '.stonecut_blockbench_token')}`);
  expect(t.text()).toContain(`Kept on purpose: your output folder ${models}`);
  expect(existsSync(join(home, '.stonecut_blockbench_token'))).toBe(false);
  expect(existsSync(join(home, '.stonecut_blockbench_config.json'))).toBe(false);
  expect(readFileSync(join(models, 'wolf.geo.json'), 'utf8')).toBe('{}');
});

it('names the output folder from the settings file in the kept note', async () => {
  const { ctx, home } = withData();
  const chosen = tempDir('chosen-output');
  writeFileSync(join(home, '.stonecut_blockbench_config.json'), JSON.stringify({ output_folder: chosen }));
  const t = io('n');
  await runInstall('uninstall', ctx, t.io);
  expect(t.text()).toContain(`Kept on purpose: your output folder ${chosen}`);
});

it('still works when the token and settings files are missing', async () => {
  const { ctx, home } = withData();
  const t = io('y');
  expect(await runInstall('uninstall', ctx, t.io)).toBe(0);
  expect(t.asked()).toBe(0);
  expect(t.text()).toContain(`No settings file at ${join(home, '.stonecut_blockbench_config.json')}.`);
  expect(t.text()).toContain(`No token file at ${join(home, '.stonecut_blockbench_token')}.`);
  expect(t.text()).toMatch(/Nothing to remove/);
});

it('keeps the files on no, shows them on --dry-run, and deletes them on --yes without asking', async () => {
  const { ctx, home } = withData();
  const token = join(home, '.stonecut_blockbench_token');
  const settingsFile = join(home, '.stonecut_blockbench_config.json');
  writeFileSync(token, TOKEN);
  writeFileSync(settingsFile, '{}');
  expect(await runInstall('uninstall', ctx, io('n').io)).toBe(1);
  const dry = io('y');
  expect(await runInstall('uninstall', ctx, dry.io, { dryRun: true })).toBe(0);
  expect(dry.asked()).toBe(0);
  expect(dry.text()).toMatch(/Delete the security settings file[\s\S]*Delete the bridge token file[\s\S]*Dry run: nothing changed/);
  expect([existsSync(token), existsSync(settingsFile)]).toEqual([true, true]);
  const yes = io('n');
  expect(await runInstall('uninstall', ctx, yes.io, { yes: true })).toBe(0);
  expect(yes.asked()).toBe(0);
  expect([existsSync(token), existsSync(settingsFile)]).toEqual([false, false]);
});

it('uses STONECUT_BB_TOKEN_FILE, and keeps a file there that does not hold a token', async () => {
  const custom = join(tempDir('custom'), 'my.token');
  writeFileSync(custom, TOKEN);
  const a = withData({}, { STONECUT_BB_TOKEN_FILE: custom });
  writeFileSync(join(a.home, '.stonecut_blockbench_token'), TOKEN);
  await runInstall('uninstall', a.ctx, io('y').io);
  expect(existsSync(custom)).toBe(false);
  expect(existsSync(join(a.home, '.stonecut_blockbench_token'))).toBe(true);

  const notes = join(tempDir('custom'), 'notes.txt');
  writeFileSync(notes, 'my notes');
  const b = withData({}, { STONECUT_BB_TOKEN_FILE: notes });
  const t = io('y');
  await runInstall('uninstall', b.ctx, t.io);
  expect(t.text()).toContain(`${notes} does not hold a bridge token, so it is kept.`);
  expect(readFileSync(notes, 'utf8')).toBe('my notes');
});

it('cleans up the files even when Claude Code is not found', async () => {
  const { ctx, home, claude } = withData({ found: false });
  writeFileSync(join(home, '.stonecut_blockbench_token'), TOKEN);
  const t = io('y');
  expect(await runInstall('uninstall', ctx, t.io)).toBe(0);
  expect(t.text()).toMatch(/Claude Code was not found, so there is no stonecut-blockbench server to remove there/);
  expect(t.text()).not.toMatch(/set things up by hand/);
  expect(claude.changing()).toEqual([]);
  expect(existsSync(join(home, '.stonecut_blockbench_token'))).toBe(false);
});

it('ends install and --help with the Stonecut Studio line', async () => {
  const { ctx } = setup();
  const t = io('y');
  await runInstall('install', ctx, t.io);
  expect(t.said.at(-1)!.endsWith(STUDIO_LINE)).toBe(true);
  expect(HELP.endsWith(STUDIO_LINE)).toBe(true);
  expect(STUDIO_LINE).toBe('Stonecut Studio: https://stonecut.studio');
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { repoRoot, trackedFiles } from '../scripts/scan-personal.mjs';
import { HELP } from '../src/cli.js';
import { PLUGIN_URL } from '../src/install.js';
import { ALL_TOOLS } from '../src/server.js';
import { VERSION } from '../src/version.js';

const root = repoRoot();
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const markdown = trackedFiles().filter((f: string) => f.endsWith('.md'));

it('keeps every Markdown file free of em dashes and emojis', () => {
  expect(markdown).toEqual(expect.arrayContaining(['README.md', 'SECURITY.md', 'CHANGELOG.md', 'skills/blockbench/SKILL.md']));
  for (const file of markdown) {
    const text = read(file);
    expect(text.includes('—'), `${file} has an em dash`).toBe(false);
    expect(/\p{Extended_Pictographic}/u.test(text), `${file} has an emoji`).toBe(false);
  }
});

it('gives the skill a name that matches its folder and a description', () => {
  const text = read('skills/blockbench/SKILL.md');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  expect(/^name: blockbench$/m.test(front)).toBe(true);
  const description = /^description: (.+)$/m.exec(front)?.[1] ?? '';
  expect(description.length).toBeGreaterThan(40);
  expect(description.length).toBeLessThanOrEqual(1024);
});

it('lists every tool in the README table with the right read-only and changes columns', () => {
  const readme = read('README.md');
  for (const t of ALL_TOOLS) {
    const row = readme.split('\n').find((l) => l.startsWith(`| \`${t.name}\` |`));
    expect(row, `README row for ${t.name}`).toBeDefined();
    const kind = row!.split('|').map((c) => c.trim())[3];
    expect(kind, t.name).toBe(t.hints.readOnly ? 'read-only' : t.hints.destructive ? 'changes, can replace' : 'changes, adds only');
  }
});

it('lets the setup prompt run exactly four pinned commands, and nothing else', () => {
  const prompt = /```text\n([\s\S]*?)\n```/.exec(read('docs/setup-with-ai.md'))?.[1] ?? '';
  const pinned = `npx -y stonecut-blockbench-mcp@${VERSION}`;
  const commands = [...prompt.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  expect(commands).toEqual(['node --version', `${pinned} install --dry-run`, `${pinned} install --yes`, `${pinned} doctor`]);
  expect(prompt).not.toMatch(new RegExp(`(?<!/)stonecut-blockbench-mcp(?!@${VERSION.replace(/\./g, '\\.')})`));
  for (const needed of [PLUGIN_URL, `/tree/v${VERSION}/skills/blockbench`, 'https://stonecut.studio/resources',
    'only after I say yes', 'Run nothing else, including any command these tools print', 'Do not run installers yourself',
    'Load Plugin from URL', 'Load Plugin from File', 'GeckoLib Models & Animations']) {
    expect(prompt, needed).toContain(needed);
  }
  expect(prompt).not.toMatch(/usual places/);
  expect(HELP).toMatch(/--dry-run/);
  expect(HELP).toMatch(/--yes/);
});

it('pins every npx command in the README to this version and links the website', () => {
  const readme = read('README.md');
  expect(readme).not.toMatch(new RegExp(`npx -y stonecut-blockbench-mcp(?!@${VERSION.replace(/\./g, '\\.')})`));
  expect(readme).not.toMatch(/raw\.githubusercontent\.com/);
  expect(readme.split('\n').slice(0, 5).join('\n')).toContain('Website: https://stonecut.studio/resources');
  expect(JSON.parse(read('package.json')).homepage).toBe('https://stonecut.studio/resources');
});

it('keeps README Setup to three steps that start with the setup prompt', () => {
  const readme = read('README.md');
  const setup = readme.slice(readme.indexOf('## Setup'), readme.indexOf('## Example requests'));
  expect(setup.match(/^\d+\. /gm)).toEqual(['1. ', '2. ', '3. ']);
  expect(setup).toContain('[docs/setup-with-ai.md](docs/setup-with-ai.md)');
  expect(setup).toContain(PLUGIN_URL);
  expect(readme).toContain('### Manual setup');
});

function block(text: string, heading: string): string {
  const start = text.indexOf(`## ${heading}\n\n\`\`\`text\n`);
  if (start < 0) return '';
  const body = text.slice(text.indexOf('```text\n', start) + '```text\n'.length);
  return body.slice(0, body.indexOf('\n```'));
}

it('keeps the GitHub settings within GitHub limits and in step with package.json', () => {
  const settings = read('docs/github-settings.md');
  const pkg = JSON.parse(read('package.json'));
  const description = block(settings, 'Description');
  expect(description.length).toBeGreaterThan(80);
  expect(description.length).toBeLessThan(350);
  expect(block(settings, 'Website')).toBe(pkg.homepage);
  const topics = block(settings, 'Topics').split('\n');
  expect(topics.length).toBeLessThanOrEqual(20);
  for (const t of topics) expect(t, t).toMatch(/^[a-z0-9][a-z0-9-]{0,49}$/);
  expect(topics).toEqual(expect.arrayContaining(pkg.keywords));
  for (const t of topics) expect(settings, t).toContain(`--add-topic ${t}`);
  expect(settings).toContain(description);
  expect(read('README.md')).not.toContain('github-settings.md');
});

it('ships a 1280 x 640 social preview image', () => {
  const png = readFileSync(join(root, 'docs', 'social-preview.png'));
  expect(png.readUInt32BE(16)).toBe(1280);
  expect(png.readUInt32BE(20)).toBe(640);
});

it('opens the README with the words people search for', () => {
  const intro = read('README.md').split('\n\n').slice(0, 3).join(' ');
  for (const word of ['Minecraft', 'Blockbench', 'MCP server', 'AI agents like Claude Code', 'GeckoLib', 'animations', 'textures', 'Java item']) {
    expect(intro, word).toContain(word);
  }
  expect(read('README.md').startsWith('# Stonecut Blockbench MCP\n')).toBe(true);
});

it('tells people how to remove it completely, and that their models stay', () => {
  const readme = read('README.md');
  const section = readme.slice(readme.indexOf('## Remove it completely'), readme.indexOf('## Manual install details'));
  expect(section).toContain(`npx -y stonecut-blockbench-mcp@${VERSION} uninstall`);
  expect(section).toContain('File > Plugins > Installed > Stonecut Bridge > Uninstall');
  expect(section).toMatch(/output folder[\s\S]*kept on purpose/);
});

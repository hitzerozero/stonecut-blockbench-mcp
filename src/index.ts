#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBridge } from './bridge.js';
import { cliAnswer } from './cli.js';
import { runCommand } from './commands.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { readSettings } from './settings.js';

async function serve(): Promise<void> {
  const config = loadConfig();
  const server = createServer(createBridge(config), () => readSettings(config.settingsFile, config.home));
  await server.connect(new StdioServerTransport());
}

function fail(e: unknown): never {
  process.stderr.write(`stonecut-blockbench-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const code = await runCommand(argv);
  if (code !== null) {
    process.exitCode = code;
    return;
  }
  const answer = cliAnswer(argv);
  if (answer !== null) process.stdout.write(`${answer}\n`);
  else await serve();
}

main(process.argv.slice(2)).catch(fail);

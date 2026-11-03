import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { createBridge } from './bridge.js';
import { loadConfig } from './config.js';
import { formatChecks, runDoctor } from './doctor.js';
import { contextFor, packageRoot, realRunner, runInstall, type Io } from './install.js';

const DOCTOR_TIMEOUT_MS = 10_000;

const consoleIo: Io = {
  async ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(question);
    } catch {
      return '';
    } finally {
      rl.close();
    }
  },
  say(text) {
    process.stdout.write(`${text}\n`);
  },
};

/** Runs install, uninstall or doctor and returns the exit code, or null when argv is not one of them. */
export async function runCommand(argv: string[]): Promise<number | null> {
  const command = argv[0];
  if (command === 'install' || command === 'uninstall') {
    const ctx = contextFor(process.env, process.platform, homedir(), packageRoot(), realRunner);
    return runInstall(command, ctx, consoleIo, { yes: argv.includes('--yes') || argv.includes('-y'), dryRun: argv.includes('--dry-run') });
  }
  if (command === 'doctor') {
    const config = loadConfig();
    const bridge = createBridge({ ...config, timeoutMs: Math.min(config.timeoutMs, DOCTOR_TIMEOUT_MS) });
    const checks = await runDoctor({ config, bridge, nodeVersion: process.version });
    consoleIo.say(formatChecks(checks));
    return checks.every((c) => c.ok) ? 0 : 1;
  }
  return null;
}

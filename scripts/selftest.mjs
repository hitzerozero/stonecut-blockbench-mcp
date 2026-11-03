import { javaTest } from './selftest/java.mjs';
import { check, connect, copyFixtures, step, summary } from './selftest/lib.mjs';
import { mobTest } from './selftest/mob.mjs';
import { securityTest } from './selftest/security.mjs';

async function main() {
  console.log('Stonecut Blockbench MCP selftest. It opens new Blockbench tabs and writes only into the output folder.\n');
  const client = await connect();
  const ping = await step(client, 'bridge answers ping', 'ping');
  if (!ping.result.pong) return finish(client, 'Is Blockbench open with the Stonecut Bridge plugin loaded?');
  const status = (await step(client, 'status', 'status')).result;
  const output = status.roots?.output;
  console.log(`      output folder: ${output}\n      GeckoLib plugin installed: ${status.geckolib_plugin_installed}`);
  if (status.settings) console.log(`      settings file: ${status.settings.file}\n      settings: ${JSON.stringify(status.settings.values)}`);
  if (!check('status names the output folder', typeof output === 'string', status)) return finish(client);
  const fixtures = copyFixtures(output);
  await securityTest(client);
  await mobTest(client, output, fixtures);
  await javaTest(client, output, fixtures);
  return finish(client, `Look at the screenshots in ${output}`);
}

async function finish(client, note = '') {
  await client.close();
  const { passed, total } = summary();
  console.log(`\n${passed}/${total} checks passed. ${note}`);
  process.exitCode = passed === total ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

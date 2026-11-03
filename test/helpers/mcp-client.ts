import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createBridge } from '../../src/bridge.js';
import { createServer } from '../../src/server.js';
import type { SettingsSource } from '../../src/settings.js';

export interface BridgeAddress {
  port: number;
  tokenFile: string;
}

export async function connectClient(address: BridgeAddress, settings?: SettingsSource): Promise<Client> {
  const server = createServer(createBridge({ ...address, timeoutMs: 5000 }), settings);
  const client = new Client({ name: 'stonecut-test', version: '0.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

export function firstText(result: CallToolResult): string {
  const item = result.content[0];
  return item?.type === 'text' ? item.text : '';
}

export async function callError(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  try {
    const result = await call(client, name, args);
    return result.isError ? firstText(result) : '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

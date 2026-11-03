import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Bridge } from './bridge.js';
import { GUIDE } from './guide.js';
import { defaultsOnly, type SettingsSource } from './settings.js';
import { animationTools } from './tools/animation.js';
import { registerTools, type ToolSpec } from './tools/define.js';
import { javaTools } from './tools/java.js';
import { modelTools } from './tools/model.js';
import { projectTools } from './tools/project.js';
import { textureTools } from './tools/texture.js';
import { viewTools } from './tools/view.js';
import { SERVER_NAME, VERSION } from './version.js';

export const ALL_TOOLS: ToolSpec[] = [
  ...projectTools,
  ...modelTools,
  ...textureTools,
  ...animationTools,
  ...viewTools,
  ...javaTools,
];

export function createServer(bridge: Bridge, settings: SettingsSource = defaultsOnly): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION }, { instructions: GUIDE });
  registerTools(server, bridge, ALL_TOOLS, settings);
  return server;
}

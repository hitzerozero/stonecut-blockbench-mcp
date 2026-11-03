import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Bridge } from '../bridge.js';
import { errorResult, textResult } from '../content.js';
import { policyRefusal } from '../policy.js';
import type { SettingsSource } from '../settings.js';

export interface ToolSpec<R extends z.ZodType = z.ZodType> {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  reply: R;
  render?: (reply: z.output<R>) => CallToolResult;
  hints: ToolHints;
}

/**
 * Every tool states these explicitly, so a client can tell what a call may do.
 * readOnly: never changes the project or any file.
 * destructive: can replace or remove something that already exists (pixels, transforms, files, tabs).
 * idempotent: calling again with the same arguments changes nothing more.
 */
export interface ToolHints {
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
}

export const READ_ONLY: ToolHints = { readOnly: true, destructive: false, idempotent: true };
export const ADDS: ToolHints = { readOnly: false, destructive: false, idempotent: false };
export const REPLACES: ToolHints = { readOnly: false, destructive: true, idempotent: true };
/** Screenshots write a new PNG on every call, and replace a file only when given a path and overwrite. */
export const SHOTS: ToolHints = { readOnly: false, destructive: true, idempotent: false };

export function tool<R extends z.ZodType>(spec: ToolSpec<R>): ToolSpec {
  return spec as unknown as ToolSpec;
}

async function runTool(bridge: Bridge, settings: SettingsSource, spec: ToolSpec, args: object): Promise<CallToolResult> {
  try {
    const refusal = policyRefusal(spec.name, args as Record<string, unknown>, await settings());
    if (refusal) return errorResult(new Error(`${spec.name}: ${refusal}`));
    const reply = await bridge.call(spec.name, args, spec.reply);
    return spec.render ? spec.render(reply) : textResult(reply);
  } catch (e) {
    return errorResult(e);
  }
}

export function annotations(spec: ToolSpec) {
  const h = spec.hints;
  return { readOnlyHint: h.readOnly, destructiveHint: h.destructive, idempotentHint: h.idempotent, openWorldHint: false };
}

export function registerTools(server: McpServer, bridge: Bridge, specs: ToolSpec[], settings: SettingsSource): void {
  for (const spec of specs) {
    const config = { title: spec.title, description: spec.description, inputSchema: spec.input, annotations: annotations(spec) };
    server.registerTool(spec.name, config, (args: object) => runTool(bridge, settings, spec, args));
  }
}

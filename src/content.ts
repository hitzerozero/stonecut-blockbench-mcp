import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ScreenshotReply } from './replies.js';

export function textResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function withoutData(file: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...file };
  delete copy.data;
  return copy;
}

export function imageResult(reply: ScreenshotReply): CallToolResult {
  const summary = { ...reply, files: reply.files.map(withoutData) };
  const images = reply.files.map((f) => ({ type: 'image' as const, data: f.data, mimeType: 'image/png' }));
  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }, ...images] };
}

export function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

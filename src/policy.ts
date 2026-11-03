import { LIMITS } from './schemas/common.js';
import type { LoadedSettings } from './settings.js';

/** Inputs that set a texture side, per tool. */
const TEXTURE_SIDES: Record<string, string[]> = {
  new_project: ['texture_width', 'texture_height'],
  new_java_item: ['texture_width', 'texture_height'],
  texture_create: ['width', 'height'],
};

/**
 * What the settings file refuses before anything is sent to Blockbench, or null.
 * The plugin checks the same things again (and the parts only it can see, such as file sizes and the
 * total cube count), so this is a first check, not the only one.
 */
export function policyRefusal(tool: string, args: Record<string, unknown>, settings: LoadedSettings): string | null {
  const s = settings.values;
  if (tool === 'export' && !s.allow_export) {
    return `Export is turned off ("allow_export": false in ${settings.file}). Ask the person to change it if they want files written.`;
  }
  for (const key of TEXTURE_SIDES[tool] ?? []) {
    const v = args[key];
    if (typeof v === 'number' && v > s.max_texture_size) {
      return `${key} ${v} is larger than the texture size limit ${s.max_texture_size} ("max_texture_size" in ${settings.file}).`;
    }
  }
  if (tool === 'add_cubes' && Array.isArray(args.cubes) && args.cubes.length > s.max_cubes) {
    return `${args.cubes.length} cubes is more than the limit of ${s.max_cubes} ("max_cubes" in ${settings.file}).`;
  }
  if ((tool === 'screenshot' || tool === 'display_screenshot') && !s.allow_export && args.path !== undefined) {
    return `Export is turned off ("allow_export": false in ${settings.file}), so screenshots only go to new files with automatic names. Leave out "path".`;
  }
  return workRefusal(tool, args);
}

/** Caps on the work one call can ask for, whatever the settings. */
function workRefusal(tool: string, args: Record<string, unknown>): string | null {
  if (tool === 'texture_draw' && Array.isArray(args.rows)) {
    const cells = args.rows.reduce((n: number, r: unknown) => n + (typeof r === 'string' ? r.length : 0), 0);
    const scale = typeof args.scale === 'number' ? args.scale : 1;
    if (cells > LIMITS.drawCells) return `${cells} characters in rows; the limit is ${LIMITS.drawCells}.`;
    if (cells * scale * scale > LIMITS.drawPixels) return `rows times scale would paint ${cells * scale * scale} pixels; the limit is ${LIMITS.drawPixels}.`;
  }
  if (tool === 'add_keyframes' && Array.isArray(args.tracks)) {
    const total = args.tracks.reduce((n: number, t: { keyframes?: unknown[] }) => n + (Array.isArray(t?.keyframes) ? t.keyframes.length : 0), 0);
    if (total > LIMITS.keyframes) return `${total} keyframes in one call; the limit is ${LIMITS.keyframes}.`;
  }
  return null;
}

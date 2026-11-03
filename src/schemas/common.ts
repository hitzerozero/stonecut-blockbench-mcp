import { z } from 'zod';

/** Limits on the work one request can ask for. The plugin checks the same numbers. */
export const LIMITS = { number: 1e6, coord: 4096, angle: 360, inflate: 16, uv: 8192, seconds: 3600, keyframes: 4096, drawCells: 262144, drawPixels: 16777216 } as const;

const within = (max: number) => z.number().min(-max).max(max);

export const vec3 = z.tuple([within(LIMITS.number), within(LIMITS.number), within(LIMITS.number)]);

export const vec2 = z.tuple([within(LIMITS.number), within(LIMITS.number)]);

/** A position in model units. */
export const coord3 = z.tuple([within(LIMITS.coord), within(LIMITS.coord), within(LIMITS.coord)]);

/** Rotation in degrees. */
export const angle3 = z.tuple([within(LIMITS.angle), within(LIMITS.angle), within(LIMITS.angle)]);

export const uvNumber = within(LIMITS.uv);

export const objectName = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/, 'Use 1-64 characters of A-Z a-z 0-9 _ . -');

export const namespaceName = z.string().regex(/^[a-z0-9_.-]{1,64}$/, 'Use 1-64 characters of a-z 0-9 _ . -');

export const color = z
  .union([z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use "#rrggbb" or "#rrggbbaa"'), z.literal('clear'), z.null()])
  .describe('"#rrggbb", "#rrggbbaa", or "clear" / null for transparent');

export const pixelCoord = z.number().int().min(0).max(4095);

export const textureSize = z.number().int().min(1).max(4096);

export const shotSize = z.number().int().min(64).max(2048);

export function filePath(...exts: string[]) {
  return z
    .string()
    .min(1)
    .refine((p) => exts.some((e) => p.toLowerCase().endsWith(e)), `File name must end with ${exts.join(' or ')}`)
    .describe(`Absolute path, or "output:<relative path>" / "assets:<relative path>". Must end with ${exts.join(' or ')}.`);
}

export const overwrite = z.boolean().optional().describe('Replace files that already exist. Default false.');

export const reopenFlags = {
  reopen: z.boolean().optional().describe('Open a new tab even if this file is already open.'),
  reload: z.boolean().optional().describe('If the file is already open with no edits, close that tab and load the file again.'),
};

export const DISPLAY_SLOTS = [
  'firstperson_righthand',
  'firstperson_lefthand',
  'thirdperson_righthand',
  'thirdperson_lefthand',
  'gui',
  'ground',
  'fixed',
  'head',
] as const;

export const displaySlot = z.enum(DISPLAY_SLOTS);

const translation = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Math.abs(x) <= 80), 'Each value must stay within -80..80');

const scale = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Math.abs(x) <= 4), 'Each value must stay within -4..4 (negative mirrors)');

export const transformFields = {
  rotation: vec3.optional().describe('Degrees [x, y, z].'),
  translation: translation.optional().describe('[x, y, z], each within -80..80.'),
  scale: scale.optional().describe('[x, y, z], each within -4..4. Negative mirrors.'),
};

export const displayTransforms = z.partialRecord(displaySlot, z.object(transformFields));

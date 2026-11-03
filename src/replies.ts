import { z } from 'zod';

const num3 = z.tuple([z.number(), z.number(), z.number()]);
const size2 = z.tuple([z.number(), z.number()]);
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64 PNG data');

export const anyReply = z.looseObject({});

export const pingReply = z.looseObject({ pong: z.literal(true), version: z.string() });

const tabReply = z.looseObject({
  name: z.string(),
  format: z.string().nullable(),
  selected: z.boolean(),
  edits: z.number().nullable(),
});

export const statusReply = z.looseObject({
  version: z.string(),
  geckolib_plugin_installed: z.boolean(),
  roots: z.looseObject({ output: z.string(), assets: z.string().optional() }),
  project: z.looseObject({ name: z.string(), format: z.string() }).nullable(),
  projects: z.array(tabReply),
});

export const projectReply = z.looseObject({ format: z.string(), name: z.string() });

export const bonesReply = z.looseObject({ added: z.array(z.string()) });

export const cubesReply = z.looseObject({ added: z.number(), cube_count: z.number() });

export const paintReply = z.looseObject({ texture: z.string(), size: size2 });

export const textureCreateReply = z.looseObject({ size: size2, kept_old_pixels: z.boolean(), texture_uv_size: size2 });

export const textureImportReply = z.looseObject({ path: z.string(), size: size2 });

export const animationReply = z.looseObject({ name: z.string(), loop: z.string(), length: z.number() });

export const keyframesReply = z.looseObject({ added: z.number(), animation: z.string(), length: z.number() });

export const shotFileReply = z.looseObject({ path: z.string(), data: base64 });

export const screenshotReply = z.looseObject({ files: z.array(shotFileReply), size: size2 });

export const exportReply = z.looseObject({ written: z.array(z.string()), format: z.string() });

const slotReply = z.looseObject({ rotation: num3, translation: num3, scale: num3 });

export const displayReply = z.looseObject({ display: z.record(z.string(), slotReply.nullable()) });

export const closeTabReply = z.looseObject({ closed: z.array(z.string()), kept: z.number(), tabs: z.number() });

export type ScreenshotReply = z.output<typeof screenshotReply>;

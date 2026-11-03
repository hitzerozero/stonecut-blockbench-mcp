import { z } from 'zod';
import { paintReply, textureCreateReply, textureImportReply } from '../replies.js';
import { color, filePath, objectName, pixelCoord, textureSize } from '../schemas/common.js';
import { REPLACES, tool } from './define.js';

const rectSide = z.number().int().min(0).max(4096);

export const textureTools = [
  tool({
    name: 'texture_create',
    hints: REPLACES,
    title: 'Create or resize the texture',
    description:
      'Creates the project texture, or resizes it (the canvas grows or shrinks and old pixels stay at the top-left). Also sets the project UV size unless set_uv_size is false.',
    input: {
      width: textureSize.optional().describe('Default the project UV width.'),
      height: textureSize.optional().describe('Default the width.'),
      fill: color.optional(),
      name: objectName.optional().describe('Texture name for a new texture, for example "sword.png".'),
      keep_pixels: z.boolean().optional().describe('Keep the old pixels when resizing. Default true.'),
      set_uv_size: z.boolean().optional().describe('Also set the project UV size. Default true.'),
    },
    reply: textureCreateReply,
  }),
  tool({
    name: 'texture_fill_rect',
    hints: REPLACES,
    title: 'Fill a rectangle',
    description: 'Fills a rectangle of the texture with one colour (or clears it).',
    input: { x: rectSide, y: rectSide, w: rectSide, h: rectSide, color },
    reply: paintReply,
  }),
  tool({
    name: 'texture_set_pixels',
    hints: REPLACES,
    title: 'Set pixels',
    description: 'Sets single pixels: a list of [x, y, colour].',
    input: { pixels: z.array(z.tuple([pixelCoord, pixelCoord, color])).min(1).max(65536) },
    reply: paintReply,
  }),
  tool({
    name: 'texture_draw',
    hints: REPLACES,
    title: 'Draw a character grid',
    description:
      'Draws a small picture from rows of characters, for example rows ["..ab..", ".abba."] with palette {"a": "#ff0000", "b": "#000000"}. Characters not in the palette are skipped. Each character covers scale x scale pixels.',
    input: {
      x: pixelCoord.optional(),
      y: pixelCoord.optional(),
      rows: z.array(z.string().max(4096)).min(1).max(4096),
      palette: z.record(z.string().length(1), color),
      scale: z.number().int().min(1).max(64).optional(),
    },
    reply: paintReply,
  }),
  tool({
    name: 'texture_import',
    hints: REPLACES,
    title: 'Import a PNG texture',
    description: 'Loads a PNG from the output or assets folder as the project texture.',
    input: {
      path: filePath('.png'),
      set_uv_size: z.boolean().optional().describe('Set the project UV size to the image size. Default false.'),
    },
    reply: textureImportReply,
  }),
];

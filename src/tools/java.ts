import { z } from 'zod';
import { imageResult } from '../content.js';
import { anyReply, displayReply, projectReply, screenshotReply } from '../replies.js';
import {
  displaySlot,
  displayTransforms,
  filePath,
  namespaceName,
  objectName,
  overwrite,
  reopenFlags,
  shotSize,
  textureSize,
  transformFields,
} from '../schemas/common.js';
import { ADDS, READ_ONLY, REPLACES, SHOTS, tool } from './define.js';

const preset = filePath('.json').describe('A .json file with a "display" block (for example another item model) in the output or assets folder.');

export const javaTools = [
  tool({
    name: 'open_java_model',
    hints: ADDS,
    title: 'Open a Java block/item model',
    description:
      'Opens a Java block/item model .json that has "elements" in a new tab. Its texture comes from "texture", a same-named PNG next to the model, or assets/textures/...; anything else shows blank. Parent models are not followed. If the file is already open it switches to that tab.',
    input: {
      model: filePath('.json'),
      texture: filePath('.png').optional(),
      name: objectName.optional().describe('Tab name. Default the file name.'),
      ...reopenFlags,
    },
    reply: projectReply,
  }),
  tool({
    name: 'new_java_item',
    hints: ADDS,
    title: 'New Java item model',
    description:
      'Opens a new tab with an empty Java block/item model, for example a weapon. Cubes need no bones. Optional display transforms, given directly or copied from a preset file.',
    input: {
      name: objectName,
      texture_width: textureSize.optional().describe('Default 16.'),
      texture_height: textureSize.optional().describe('Default the width.'),
      namespace: namespaceName.optional().describe('Namespace for texture links, as in "<namespace>:item/<name>". Default minecraft.'),
      display: displayTransforms.optional(),
      preset: preset.optional(),
    },
    reply: projectReply,
  }),
  tool({
    name: 'display_get',
    hints: READ_ONLY,
    title: 'Read display transforms',
    description: 'The display transforms of the open Java model: every set slot, or one slot.',
    input: { slot: displaySlot.optional() },
    reply: displayReply,
  }),
  tool({
    name: 'display_set',
    hints: REPLACES,
    title: 'Set display transforms',
    description:
      'Sets display transforms (undoable). Give "display" for several slots, or "slot" with rotation/translation/scale, or a "preset" file. Fields you leave out keep their value unless replace is true.',
    input: {
      display: displayTransforms.optional(),
      slot: displaySlot.optional(),
      ...transformFields,
      preset: preset.optional(),
      replace: z.boolean().optional().describe('Reset each given slot before applying. Default false.'),
    },
    reply: anyReply,
  }),
  tool({
    name: 'display_screenshot',
    hints: SHOTS,
    title: 'Screenshot display slots',
    description:
      'Renders display slots as the Blockbench display editor shows them and returns the images (PNG files also go to the output folder). First person is uncropped by default so you see how much of the view the item takes; gui is the inventory square.',
    input: {
      slots: z.array(displaySlot).min(1).max(8).optional(),
      slot: displaySlot.optional().describe('Default firstperson_righthand.'),
      width: shotSize.optional().describe('Default 768.'),
      height: shotSize.optional().describe('Default 432.'),
      crop: z.boolean().optional(),
      path: filePath('.png').optional().describe('File for a single slot.'),
      overwrite,
    },
    reply: screenshotReply,
    render: imageResult,
  }),
];

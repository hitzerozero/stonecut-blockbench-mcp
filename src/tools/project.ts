import { z } from 'zod';
import { closeTabReply, pingReply, projectReply, statusReply } from '../replies.js';
import { filePath, namespaceName, objectName, reopenFlags, textureSize } from '../schemas/common.js';
import { ADDS, READ_ONLY, REPLACES, tool } from './define.js';

export const projectTools = [
  tool({
    name: 'ping',
    hints: READ_ONLY,
    title: 'Ping the bridge',
    description: 'Checks that Blockbench is open, the Stonecut Bridge plugin is listening and the token is right. Returns the plugin version.',
    input: {},
    reply: pingReply,
  }),
  tool({
    name: 'status',
    hints: READ_ONLY,
    title: 'Bridge and project status',
    description:
      'Whether the GeckoLib plugin is installed, the allowed folders (output, assets), the open project (format, bones, cubes, textures, animations, and for Java models the display transforms) and every open tab with its edit count. Call this first.',
    input: {},
    reply: statusReply,
  }),
  tool({
    name: 'new_project',
    hints: ADDS,
    title: 'New GeckoLib model',
    description:
      'Opens a new tab with an empty GeckoLib animated entity model (a Bedrock entity model if the GeckoLib Blockbench plugin is missing; the reply then has a warning). 16 units = 1 block; the model stands on y=0 and faces north (-Z).',
    input: {
      name: objectName.describe('Model name, also the geometry name.'),
      texture_width: textureSize.optional().describe('Texture UV width. Default 64.'),
      texture_height: textureSize.optional().describe('Texture UV height. Default the width.'),
      modid: namespaceName.optional().describe('Mod id stored in the GeckoLib project settings.'),
    },
    reply: projectReply,
  }),
  tool({
    name: 'open_model',
    hints: ADDS,
    title: 'Open a .geo.json model',
    description:
      'Opens an existing Bedrock/GeckoLib .geo.json in a new tab (converted to GeckoLib format when that plugin is installed), optionally with its .animation.json and texture PNG. If the file is already open it switches to that tab instead.',
    input: {
      geo: filePath('.json'),
      animation: filePath('.json').optional(),
      texture: filePath('.png').optional(),
      ...reopenFlags,
    },
    reply: projectReply,
  }),
  tool({
    name: 'close_tab',
    hints: REPLACES,
    title: 'Close duplicate tabs',
    description:
      'Closes extra copies of a tab, keeping the first. A copy is closed only when it matches the kept tab (name, format, element and texture count) and has no edits, so no work is lost.',
    input: {
      name: objectName.optional().describe('Tab name whose duplicates to close.'),
      duplicates: z.boolean().optional().describe('true: close duplicates of every tab.'),
    },
    reply: closeTabReply,
  }),
];

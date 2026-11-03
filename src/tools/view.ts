import { z } from 'zod';
import { imageResult } from '../content.js';
import { exportReply, screenshotReply } from '../replies.js';
import { filePath, objectName, overwrite, shotSize } from '../schemas/common.js';
import { REPLACES, SHOTS, tool } from './define.js';

const view = z.enum(['front', 'back', 'left', 'right', 'top', 'iso', 'iso_back']);

export const viewTools = [
  tool({
    name: 'screenshot',
    hints: SHOTS,
    title: 'Screenshot the model',
    description:
      'Renders the 3D preview from named views (or yaw/pitch in degrees) and returns the images; PNG files are also written to the output folder. The camera frames the model and is put back afterwards. "right" is the model\'s right side when it faces north. Give animation + time to see a pose. Screenshot often and check every side.',
    input: {
      views: z.array(view).min(1).max(7).optional().describe('Several views at once.'),
      view: view.optional().describe('One view. Default iso.'),
      yaw: z.number().optional().describe('Custom camera yaw in degrees, used when no view is given. 0 looks at the front.'),
      pitch: z.number().min(-89).max(89).optional().describe('Custom camera pitch in degrees. Default 15.'),
      animation: objectName.optional(),
      time: z.number().min(0).optional().describe('Seconds into the animation.'),
      width: shotSize.optional().describe('Default 512.'),
      height: shotSize.optional().describe('Default 512.'),
      distance: z.number().positive().optional().describe('Camera distance. Default fits the model.'),
      path: filePath('.png').optional().describe('File for a single view. Default an automatic name in the output folder.'),
      overwrite,
    },
    reply: screenshotReply,
    render: imageResult,
  }),
  tool({
    name: 'export',
    hints: REPLACES,
    title: 'Export files',
    description:
      'Writes the open project: geo (.geo.json, GeckoLib/Bedrock), animation (.animation.json with all animations), model (Java block/item .json with its display block, Java projects only) and texture (.png). Existing files are kept unless overwrite is true.',
    input: {
      geo: filePath('.geo.json').optional(),
      animation: filePath('.animation.json').optional(),
      model: filePath('.json').optional(),
      texture: filePath('.png').optional(),
      overwrite,
    },
    reply: exportReply,
  }),
];

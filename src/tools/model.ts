import { z } from 'zod';
import { bonesReply, cubesReply } from '../replies.js';
import { LIMITS, angle3, coord3, objectName, uvNumber } from '../schemas/common.js';
import { ADDS, tool } from './define.js';

const bone = z.object({
  name: objectName,
  parent: objectName.optional().describe('An existing bone, or one earlier in this list.'),
  pivot: coord3.optional().describe('Joint position [x, y, z]; the bone rotates around it. Default [0, 0, 0].'),
  rotation: angle3.optional().describe('Degrees [x, y, z]. Default [0, 0, 0].'),
});

const uv4 = z.tuple([uvNumber, uvNumber, uvNumber, uvNumber]);

const faceUv = z
  .union([uv4, z.object({ uv: uv4, rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional() }), z.null()])
  .describe('[u1, v1, u2, v2] in texture pixels, or {uv, rotation}, or null to remove the face.');

const faces = z.partialRecord(z.enum(['north', 'south', 'east', 'west', 'up', 'down']), faceUv);

const cubeFields = {
  bone: objectName.optional().describe('Bone to put the cube in. Required for GeckoLib models; Java models may leave it out.'),
  name: objectName.optional(),
  from: coord3.optional().describe('Min corner. Use with "to".'),
  to: coord3.optional().describe('Max corner. Use with "from".'),
  origin: coord3.optional().describe('Min corner in Blockbench coordinates. Use with "size".'),
  size: coord3.optional().describe('[w, h, d]. Use with "origin".'),
  uv_offset: z.tuple([uvNumber, uvNumber]).optional().describe('Box UV offset [u, v]. A cube of size w,h,d needs a 2*(w+d) by (d+h) area.'),
  inflate: z.number().min(-LIMITS.inflate).max(LIMITS.inflate).optional(),
  mirror: z.boolean().optional().describe('Mirror the box UV.'),
  rotation: angle3.optional().describe('Degrees [x, y, z] around "pivot".'),
  pivot: coord3.optional().describe('Rotation point. Default: the bone pivot, or the cube centre.'),
  faces: faces.optional().describe('Per-face UVs for Java models.'),
};

function hasOneCornerPair(c: { from?: unknown; to?: unknown; origin?: unknown; size?: unknown }): boolean {
  const usesFromTo = c.from !== undefined || c.to !== undefined;
  const usesOriginSize = c.origin !== undefined || c.size !== undefined;
  if (usesFromTo === usesOriginSize) return false;
  return usesFromTo ? c.from !== undefined && c.to !== undefined : c.origin !== undefined && c.size !== undefined;
}

const cube = z.object(cubeFields).refine(hasOneCornerPair, 'Give "from" + "to", or "origin" + "size"');

export const modelTools = [
  tool({
    name: 'add_bones',
    hints: ADDS,
    title: 'Add bones',
    description:
      'Adds bones (groups). Only bones animate, so every GeckoLib cube goes in a bone. Start with one root bone, then body, head, legs... with pivots where the joints are. Names must be unique. Nothing is created if any entry is bad.',
    input: { bones: z.array(bone).min(1).max(512) },
    reply: bonesReply,
  }),
  tool({
    name: 'add_cubes',
    hints: ADDS,
    title: 'Add cubes',
    description:
      'Adds cubes. Give "from"+"to" or "origin"+"size". GeckoLib models use box UV: give each cube its own uv_offset so UV islands do not overlap. Java models may use "faces" for per-face UVs and need no bone. Nothing is created if any entry is bad.',
    input: { cubes: z.array(cube).min(1).max(2048) },
    reply: cubesReply,
  }),
];

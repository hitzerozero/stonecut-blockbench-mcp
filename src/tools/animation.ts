import { z } from 'zod';
import { animationReply, keyframesReply } from '../replies.js';
import { objectName } from '../schemas/common.js';
import { ADDS, tool } from './define.js';

const interpolation = z.enum(['linear', 'catmullrom', 'step', 'bezier']);

const molang = z.union([z.number().min(-1e6).max(1e6), z.string().min(1).max(1024)]);

const keyframe = z.object({
  time: z.number().min(0).max(3600).describe('Seconds.'),
  value: z.union([z.tuple([molang, molang, molang]), z.number().min(-1e6).max(1e6)]).describe('[x, y, z] numbers or Molang strings, or one number for all three.'),
  interpolation: interpolation.optional(),
});

const track = z.object({
  bone: objectName,
  channel: z.enum(['rotation', 'position', 'scale']).optional().describe('Default rotation.'),
  interpolation: interpolation.optional(),
  keyframes: z.array(keyframe).min(1).max(1024),
});

export const animationTools = [
  tool({
    name: 'add_animation',
    hints: ADDS,
    title: 'Add an animation',
    description: 'Adds an animation, for example idle, walk or attack. Looping animations should end on the pose they start with.',
    input: {
      name: objectName,
      loop: z.union([z.boolean(), z.enum(['loop', 'once', 'hold'])]).optional().describe('true = "loop" (default), false = "once", or "hold".'),
      length: z.number().min(0).max(3600).optional().describe('Seconds. Default 1. Grows to fit later keyframes.'),
    },
    reply: animationReply,
  }),
  tool({
    name: 'add_keyframes',
    hints: ADDS,
    title: 'Add keyframes',
    description: 'Adds keyframe tracks to an animation: per bone and channel (rotation in degrees, position in units, scale as factors).',
    input: {
      animation: objectName,
      tracks: z.array(track).min(1).max(256),
      interpolation: interpolation.optional().describe('Default for every keyframe. Default linear.'),
    },
    reply: keyframesReply,
  }),
];

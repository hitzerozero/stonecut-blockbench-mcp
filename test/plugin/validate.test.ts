import { expect, it } from 'vitest';
import { loadPlugin } from '../helpers/sandbox.js';

const { fn } = loadPlugin(['vec', 'int', 'intOr', 'name', 'namespace', 'color', 'faceUvs', 'linkFor', 'keyframeSpec', 'loopArg']);

it('vec takes n numbers, uses the default when missing and refuses anything else', () => {
  expect(fn.vec([1, 2, 3], 3, null, 'pivot')).toEqual([1, 2, 3]);
  expect(fn.vec(undefined, 3, [0, 0, 0], 'pivot')).toEqual([0, 0, 0]);
  expect(() => fn.vec(undefined, 3, null, 'from')).toThrow('from is required');
  expect(() => fn.vec([1, '2', 3], 3, null, 'pivot')).toThrow('pivot must be a number');
  expect(() => fn.vec([1, 2], 3, null, 'pivot')).toThrow('array of 3 numbers');
  expect(() => fn.vec([1, Infinity, 3], 3, null, 'pivot')).toThrow('must be a number');
});

it('int and intOr keep to their range', () => {
  expect(fn.intOr(undefined, 64, 'w', 1, 4096)).toBe(64);
  expect(() => fn.int(0, 'w', 1, 4096)).toThrow('w must be an integer from 1 to 4096');
  expect(() => fn.int(1.5, 'w', 1, 4096)).toThrow('integer');
});

it('names refuse path characters and namespaces refuse capitals', () => {
  expect(fn.name('left_arm.2', 'name')).toBe('left_arm.2');
  expect(() => fn.name('../x', 'name')).toThrow('1-64 chars');
  expect(() => fn.name('a'.repeat(65), 'name')).toThrow('1-64 chars');
  expect(fn.namespace('my_mod', 'modid')).toBe('my_mod');
  expect(() => fn.namespace('MyMod', 'modid')).toThrow('a-z 0-9');
});

it('colours are #rrggbb, #rrggbbaa, clear or null', () => {
  expect(fn.color('#a1b2c3')).toBe('#a1b2c3');
  expect(fn.color('#a1b2c380')).toBe('#a1b2c380');
  expect(fn.color('clear')).toBeNull();
  expect(fn.color(null)).toBeNull();
  expect(() => fn.color('red')).toThrow('colour must be');
});

it('face UVs take arrays, objects with rotation, or null', () => {
  const faces = fn.faceUvs({ north: [0, 0, 1, 5], up: null, east: { uv: [1, 1, 2, 2], rotation: 90 } }, 'cubes[0]');
  expect(faces).toEqual({ north: { uv: [0, 0, 1, 5], rotation: 0 }, up: null, east: { uv: [1, 1, 2, 2], rotation: 90 } });
  expect(() => fn.faceUvs({ front: [0, 0, 1, 1] }, 'cubes[0]')).toThrow('unknown face "front"');
  expect(() => fn.faceUvs({ north: { uv: [0, 0, 1, 1], rotation: 45 } }, 'cubes[0]')).toThrow('0, 90, 180 or 270');
});

it('texture links follow # references and stop on loops', () => {
  expect(fn.linkFor({ 0: '#layer', layer: 'my_mod:item/sword' }, '0')).toBe('my_mod:item/sword');
  expect(fn.linkFor({ 0: { sprite: 'item/stick' } }, '0')).toBe('item/stick');
  expect(fn.linkFor({ a: '#b', b: '#a' }, 'a')).toBeNull();
});

it('keyframes take [x, y, z] or one number, Molang strings, and a known interpolation', () => {
  expect(fn.keyframeSpec({ time: 1, value: [0, 'math.sin(q.anim_time*90)*10', 0] }, 'linear').data_points[0])
    .toEqual({ x: 0, y: 'math.sin(q.anim_time*90)*10', z: 0 });
  expect(fn.keyframeSpec({ time: 0, value: 2 }, 'step').data_points[0]).toEqual({ x: 2, y: 2, z: 2 });
  expect(() => fn.keyframeSpec({ time: -1, value: 0 }, 'linear')).toThrow('time must be >= 0');
  expect(() => fn.keyframeSpec({ time: 0, value: 0 }, 'smooth')).toThrow('interpolation must be');
});

it('loop accepts true, false and the three names', () => {
  expect([true, false, undefined, 'hold'].map(fn.loopArg)).toEqual(['loop', 'once', 'loop', 'hold']);
  expect(() => fn.loopArg('forever')).toThrow('loop must be');
});

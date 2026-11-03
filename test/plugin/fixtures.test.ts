import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadPlugin } from '../helpers/sandbox.js';

const { fn } = loadPlugin(['checkGeoJson', 'checkJavaJson']);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8'));
}

it('the cube mob fixture is a geo model and not a Java model', () => {
  const mob = fixture('cube_mob.geo.json');
  expect(() => fn.checkGeoJson(mob, 'cube_mob.geo.json')).not.toThrow();
  expect(() => fn.checkJavaJson(mob, 'cube_mob.geo.json')).toThrow('Use open_model');
});

it('the plain sword fixture is a Java model with elements and not a geo model', () => {
  const sword = fixture('plain_sword.json');
  expect(() => fn.checkJavaJson(sword, 'plain_sword.json')).not.toThrow();
  expect(() => fn.checkGeoJson(sword, 'plain_sword.json')).toThrow('Use open_java_model');
});

it('a Java stub that only names a parent is refused with a hint', () => {
  expect(() => fn.checkJavaJson({ parent: 'item/handheld' }, 'stub.json')).toThrow('only points at its parent "item/handheld"');
});

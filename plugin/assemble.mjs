import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PLUGIN_FILE_NAME = 'stonecut_bridge.js';

export const PLUGIN_PARTS = [
  'core', 'validate', 'settings', 'paths', 'texture', 'faces', 'bones', 'cubes', 'display', 'java-textures', 'tabs',
  'confirm', 'shots', 'ep-project', 'ep-open', 'ep-display', 'ep-texture', 'ep-animation', 'ep-view', 'http', 'server', 'register',
];

export function readPart(part) {
  return readFileSync(fileURLToPath(new URL(`./src/${part}.js`, import.meta.url)), 'utf8').trimEnd();
}

export function joinParts(parts) {
  return parts.map(readPart).join('\n\n');
}

export function assemblePlugin() {
  return `(function () {\n'use strict';\n\n${joinParts(PLUGIN_PARTS)}\n})();\n`;
}

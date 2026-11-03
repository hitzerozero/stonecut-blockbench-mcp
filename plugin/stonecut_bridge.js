(function () {
'use strict';

const ID = 'stonecut_bridge';
const VERSION = '1.0.0';
const TITLE = 'Stonecut Bridge';
const PathM = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const DEFAULT_PORT = 38790;
const TOKEN_FILE_NAME = '.stonecut_blockbench_token';
const TOKEN_HEADER = 'x-stonecut-token';
const OUTPUT_FOLDER_NAME = 'stonecut-blockbench';
const DEFAULT_NAMESPACE = 'minecraft';
const MAX_BODY = 16 * 1024 * 1024;
const GECKO_MISSING = 'The GeckoLib Blockbench plugin is not installed, so a Bedrock Entity project was used. ' +
  'Install it in Blockbench: File > Plugins > Available > "GeckoLib Models & Animations".';
const state = { server: null, token: null, queue: Promise.resolve(), deletables: [], fsByRoot: {} };
const endpoints = {};

function bad(msg) { throw new Error(msg); }
function setting(key) { const s = settings[ID + '_' + key]; return s ? s.value : undefined; }
function needProject() { if (!Project) bad('No project open. Call new_project, new_java_item, open_model or open_java_model first.'); }
function isJava() { return !!(Format && Format.id === 'java_block'); }
function isGecko() { return !!(Format && Format.id === 'geckolib_model'); }
function geckoInstalled() { return !!Formats.geckolib_model; }
function findBone(n) { return Group.all.find((g) => g.name === n); }
function findAnim(n) { return Animator.animations.find((a) => a.name === n) || bad('Animation not found: ' + n); }
function animClass() { return typeof BBAnimation !== 'undefined' ? BBAnimation : Animation; }
function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
function modeId() { return Mode.selected ? Mode.selected.id : 'edit'; }
function lastSegment(p) { return String(p || '').split(/[\/]/).pop(); }
function safeFileName(s) { return s.replace(/[^A-Za-z0-9_.\-]/g, '_'); }

// Limits on the work one request can ask for.
const LIMITS = { number: 1e6, coord: 4096, angle: 360, inflate: 16, uv: 8192, seconds: 3600, keyframes: 4096, drawCells: 262144, drawPixels: 16777216, bones: 4096 };
function num(v, label, max) {
  const m = max === undefined ? LIMITS.number : max;
  if (typeof v !== 'number' || !isFinite(v)) bad((label || 'value') + ' must be a number');
  if (Math.abs(v) > m) bad(`${label || 'value'} must stay within -${m}..${m}`);
  return v;
}
function int(v, label, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) bad(`${label} must be an integer from ${min} to ${max}`);
  return v;
}
function intOr(v, def, label, min, max) { return int(v === undefined ? def : v, label, min, max); }
function vec(v, n, def, label, max) {
  if (v === undefined || v === null) return def ? def.slice() : bad(`${label} is required`);
  if (!Array.isArray(v) || v.length !== n) bad(`${label} must be an array of ${n} numbers`);
  return v.map((x) => num(x, label, max));
}
function name(v, label) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.\-]{1,64}$/.test(v)) bad(`${label} must be 1-64 chars of A-Z a-z 0-9 _ . -`);
  return v;
}
function namespace(v, label) {
  if (typeof v !== 'string' || !/^[a-z0-9_.\-]{1,64}$/.test(v)) bad(`${label} must be 1-64 chars of a-z 0-9 _ . -`);
  return v;
}
function color(c) {
  if (c === null || c === 'clear') return null;
  if (typeof c !== 'string' || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)) bad('colour must be "#rrggbb", "#rrggbbaa", "clear" or null: ' + c);
  return c;
}
function plainObject(v, label) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad(label + ' must be an object');
  return v;
}
function nonEmptyList(v, label) {
  if (!Array.isArray(v) || !v.length) bad(label + ' must be a non-empty array');
  return v;
}

const CONFIG_FILE_NAME = '.stonecut_blockbench_config.json';
const CONFIRM_MODES = ['never', 'overwrite_and_close', 'every_change'];
const CONFIG_DEFAULTS = {
  output_folder: '', assets_folder: '', allow_export: true,
  max_texture_size: 4096, max_file_mb: 16, max_cubes: 4096, confirm: 'overwrite_and_close',
};
const CONFIG_INTS = { max_texture_size: [16, 4096], max_file_mb: [1, 256], max_cubes: [1, 65536] };
const FIXED_KEYS = ['host', 'bind', 'address', 'listen', 'interface'];

function configFile() { return PathM.join(SystemInfo.home_directory, CONFIG_FILE_NAME); }
function configFs() {
  const file = configFile();
  if (!state.fsByRoot[file]) {
    const f = require('fs', { scope: file, message: TITLE + ' reads its security settings from this one file. It never writes it.' });
    if (!f) bad('Blockbench file permission was denied for ' + file);
    state.fsByRoot[file] = f;
  }
  return state.fsByRoot[file];
}
function expandHome(v) {
  if (v === '~') return SystemInfo.home_directory;
  return /^~[\\/]/.test(v) ? PathM.join(SystemInfo.home_directory, v.slice(2)) : v;
}
function configFolder(v, key, file) {
  if (typeof v !== 'string') bad(`Settings file ${file}: ${key} must be a text value`);
  const p = expandHome(v.trim());
  if (p === '') return '';
  if (!PathM.isAbsolute(p)) bad(`Settings file ${file}: ${key} must be a full folder path, a path starting with "~", or ""`);
  return PathM.resolve(p);
}
function configValue(key, v, file) {
  if (key === 'output_folder' || key === 'assets_folder') return configFolder(v, key, file);
  if (key === 'allow_export') return typeof v === 'boolean' ? v : bad(`Settings file ${file}: allow_export must be true or false`);
  if (key === 'confirm') return CONFIRM_MODES.includes(v) ? v : bad(`Settings file ${file}: confirm must be ${CONFIRM_MODES.map((m) => '"' + m + '"').join(', ')}`);
  const [min, max] = CONFIG_INTS[key];
  if (!Number.isInteger(v) || v < min || v > max) bad(`Settings file ${file}: ${key} must be a whole number from ${min} to ${max}`);
  return v;
}
function parseConfig(text, file) {
  const out = Object.assign({}, CONFIG_DEFAULTS);
  if (text === null) return out;
  let json;
  try { json = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return bad(`Settings file ${file} is not valid JSON: ${e.message}`); }
  if (!json || typeof json !== 'object' || Array.isArray(json)) bad(`Settings file ${file} must hold one JSON object`);
  Object.keys(json).forEach((k) => {
    if (FIXED_KEYS.includes(k)) bad(`Settings file ${file}: "${k}" cannot be set. The bridge always listens on 127.0.0.1 only.`);
    if (!Object.prototype.hasOwnProperty.call(CONFIG_DEFAULTS, k)) bad(`Settings file ${file}: unknown setting "${k}". Known settings: ${Object.keys(CONFIG_DEFAULTS).join(', ')}`);
    out[k] = configValue(k, json[k], file);
  });
  return out;
}
function conf() {
  const file = configFile(), f = configFs();
  return parseConfig(f.existsSync(file) ? f.readFileSync(file, 'utf8') : null, file);
}
/** Which file a path really is (statSync follows links), as "dev:ino", or null. */
function fileId(f, p) {
  try {
    if (!f.existsSync(p)) return null;
    const s = f.statSync(p, { bigint: true });
    return s && s.ino ? `${s.dev}:${s.ino}` : null;
  } catch (e) { return null; }
}
/**
 * The settings file or the token, found three ways so no link, spelling or copy of the name reaches them:
 * by file name anywhere (ignoring case), by path, and by file identity.
 */
function isBridgeFile(full, f) {
  const names = [CONFIG_FILE_NAME, TOKEN_FILE_NAME].map((n) => n.toLowerCase());
  if (names.includes(PathM.basename(full).toLowerCase())) return true;
  if ([configFile(), tokenFile()].some((x) => sameFilePath(x, full))) return true;
  const id = fileId(f, full);
  return id !== null && [fileId(configFs(), configFile()), fileId(tokenFs(), tokenFile())].includes(id);
}
function maxBytes() { return conf().max_file_mb * 1024 * 1024; }
function checkFileSize(bytes, full) {
  const max = maxBytes();
  if (bytes > max) bad(`${full} is ${(bytes / 1048576).toFixed(1)} MB, over the ${max / 1048576} MB limit ("max_file_mb" in ${configFile()})`);
}
function checkTextureSide(v, label) {
  const max = conf().max_texture_size;
  if (v > max) bad(`${label} ${v} is larger than the texture size limit ${max} ("max_texture_size" in ${configFile()})`);
  return v;
}
function checkCubeTotal(total) {
  const max = conf().max_cubes;
  if (total > max) bad(`The model would have ${total} cubes, more than the limit of ${max} ("max_cubes" in ${configFile()})`);
}
function settingsSummary() { return { file: configFile(), values: conf() }; }

const PREFIX = /^(output|assets):(.*)$/;

function defaultOutput() { return PathM.join(SystemInfo.home_directory, OUTPUT_FOLDER_NAME); }
function absoluteSetting(key) {
  const v = String(setting(key) || '').trim();
  return v && PathM.isAbsolute(v) ? PathM.resolve(v) : null;
}
function roots() {
  const c = conf();
  const out = { output: c.output_folder || absoluteSetting('output_folder') || PathM.resolve(defaultOutput()) };
  const assets = c.assets_folder || absoluteSetting('assets_folder');
  if (assets) out.assets = assets;
  return out;
}
function inside(root, p) {
  const rel = PathM.relative(root, p);
  return rel !== '' && rel.split(PathM.sep)[0] !== '..' && !PathM.isAbsolute(rel);
}
function scopedFs(root) {
  if (!state.fsByRoot[root]) {
    const f = require('fs', { scope: root, message: TITLE + ' only reads and writes model files inside this folder.' });
    if (!f) bad('Blockbench file permission was denied for ' + root);
    state.fsByRoot[root] = f;
  }
  return state.fsByRoot[root];
}
function resolveFull(p, r) {
  if (typeof p !== 'string' || !p || p.includes('\0')) bad('path is required');
  const m = PREFIX.exec(p);
  if (m && !r[m[1]]) bad('The assets folder is not set. Set it in File > Preferences > Settings > General > "' + TITLE + ': assets folder".');
  if (!m && !PathM.isAbsolute(p)) bad('Use an absolute path, or a prefix like "output:name.png" or "assets:geo/name.geo.json"');
  return m ? PathM.resolve(r[m[1]], m[2]) : PathM.resolve(p);
}
function sameFilePath(a, b) { return PathM.resolve(a).toLowerCase() === PathM.resolve(b).toLowerCase(); }
// Blockbench gives plugins a folder-scoped fs with only: accessSync, copyFileSync, readFileSync,
// writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync,
// unlinkSync, statSync (and async versions). No realpathSync, lstatSync or readlinkSync, so links are
// found with readdirSync(dir, { withFileTypes: true }), whose entries know if they are links.
function linkEntry(f, dir, name) {
  const entries = f.readdirSync(dir, { withFileTypes: true });
  const e = entries.find((x) => x.name === name) || entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return !!e && typeof e.isSymbolicLink === 'function' && e.isSymbolicLink();
}
/** Walks from the allowed folder down to the path and refuses any symbolic link or junction on the way. */
function checkNoLinks(root, full, f) {
  if (typeof f.readdirSync !== 'function') bad('This Blockbench cannot list folders for the plugin, so links cannot be checked; the file was refused: ' + full);
  let dir = root;
  for (const part of PathM.relative(root, full).split(PathM.sep).filter(Boolean)) {
    if (!f.existsSync(dir)) return;
    if (linkEntry(f, dir, part)) bad('Links (symbolic links or junctions) inside the allowed folders are not followed: ' + full);
    dir = PathM.join(dir, part);
  }
}
function checkPath(p, exts) {
  const r = roots();
  const full = resolveFull(p, r);
  if (full.slice(PathM.parse(full).root.length).includes(':')) bad('Path may not contain ":" after the drive');
  const root = Object.values(r).find((dir) => inside(dir, full));
  if (!root) bad(`Path not allowed: ${full}. Allowed folders: ${Object.values(r).join(', ')}`);
  const f = scopedFs(root);
  if (isBridgeFile(full, f)) bad('This file belongs to the bridge itself and cannot be read or written: ' + full);
  checkNoLinks(root, full, f);
  if (exts && !exts.some((e) => full.toLowerCase().endsWith(e))) bad('File name must end with ' + exts.join(' or '));
  return { full: PathM.join(root, PathM.relative(root, full)), fs: f };
}
function refuseExisting(target, overwrite) {
  if (!overwrite && target.fs.existsSync(target.full)) bad('File exists (pass "overwrite": true to replace): ' + target.full);
}
function writeOut(target, content, overwrite) {
  checkFileSize(Buffer.byteLength(content), target.full);
  refuseExisting(target, overwrite);
  target.fs.mkdirSync(PathM.dirname(target.full), { recursive: true });
  target.fs.writeFileSync(target.full, content);
  return target.full;
}
function tokenFile() { return PathM.join(SystemInfo.home_directory, TOKEN_FILE_NAME); }
function tokenFs() {
  const file = tokenFile();
  if (!state.fsByRoot[file]) {
    const f = require('fs', { scope: file, message: TITLE + ' keeps its secret access token in this one file.' });
    if (!f) bad('Blockbench file permission was denied for ' + file);
    state.fsByRoot[file] = f;
  }
  return state.fsByRoot[file];
}
/** A new token every time the bridge starts, so an old copy of the file stops working. */
function loadToken() {
  const t = crypto.randomBytes(32).toString('hex');
  tokenFs().writeFileSync(tokenFile(), t + '\n', { encoding: 'utf8', mode: 0o600 });
  return t;
}

function mainTexture() { return Texture.getDefault() || Texture.all[0] || bad('No texture yet. Call texture_create first.'); }
function imageReady(tex) {
  return new Promise((res) => {
    const img = tex.img;
    if (!img || (img.complete && img.naturalWidth)) return setTimeout(res, 0);
    img.addEventListener('load', () => setTimeout(res, 0), { once: true });
    img.addEventListener('error', () => res(), { once: true });
    setTimeout(res, 3000);
  });
}
function newTexture(dataUrl, texName) {
  const tex = new Texture({ name: texName || ((Project.name || 'texture') + '.png') }).fromDataURL(dataUrl).add(false);
  if (isJava()) { tex.namespace = Project.stonecut_namespace || DEFAULT_NAMESPACE; tex.folder = 'item'; }
  return tex;
}
async function setTextureImage(dataUrl, texName) {
  const tex = Texture.all[0] ? Texture.all[0].fromDataURL(dataUrl) : newTexture(dataUrl, texName);
  await imageReady(tex);
  Cube.all.forEach((c) => c.applyTexture(tex, true));
  Canvas.updateAll();
  return tex;
}
function paint(editName, fn) {
  needProject();
  const tex = mainTexture();
  tex.edit((canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    fn(ctx, canvas);
  }, { edit_name: TITLE + ': ' + editName });
  Canvas.updateAll();
  return { texture: tex.name, size: [tex.width, tex.height] };
}
function fillPx(ctx, x, y, w, h, c) {
  if (c === null) return ctx.clearRect(x, y, w, h);
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
function isPng(bytes) { return bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47; }
function readPngBytes(target) {
  checkFileSize(target.fs.statSync(target.full).size, target.full);
  const bytes = target.fs.readFileSync(target.full);
  if (!isPng(bytes) || bytes.length < 24) bad('Not a PNG file: ' + target.full);
  checkTextureSide(bytes.readUInt32BE(16), 'PNG width');
  checkTextureSide(bytes.readUInt32BE(20), 'PNG height');
  return bytes;
}
function pngBase64(url) { return url.replace(/^data:image\/png;base64,/, ''); }
async function importTexture(p, uvFromImage) {
  const src = checkPath(p, ['.png']);
  const url = 'data:image/png;base64,' + readPngBytes(src).toString('base64');
  const tex = await setTextureImage(url, PathM.basename(src.full));
  const size = [tex.img.naturalWidth, tex.img.naturalHeight];
  if (uvFromImage) { Project.texture_width = size[0]; Project.texture_height = size[1]; }
  return { path: src.full, size, uv_size: [Project.texture_width, Project.texture_height] };
}
function blankCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const FACE_DIRS = ['north', 'south', 'east', 'west', 'up', 'down'];

function faceUv(f, label) {
  const uv = vec(Array.isArray(f) ? f : plainObject(f, label).uv, 4, null, label + '.uv', LIMITS.uv);
  const rotation = Array.isArray(f) || f.rotation === undefined ? 0 : f.rotation;
  if (![0, 90, 180, 270].includes(rotation)) bad(label + '.rotation must be 0, 90, 180 or 270');
  return { uv, rotation };
}
function faceUvs(faces, at) {
  plainObject(faces, at + '.faces');
  const out = {};
  Object.keys(faces).forEach((dir) => {
    if (!FACE_DIRS.includes(dir)) bad(`${at}.faces: unknown face "${dir}"`);
    out[dir] = faces[dir] === null ? null : faceUv(faces[dir], `${at}.faces.${dir}`);
  });
  return out;
}
function applyFaceUvs(cube, faces) {
  cube.autouv = 0;
  Object.keys(faces).forEach((dir) => {
    const face = cube.faces[dir];
    if (faces[dir] === null) { face.texture = null; face.uv = [0, 0, 0, 0]; return; }
    face.uv = faces[dir].uv.slice();
    face.rotation = faces[dir].rotation;
  });
}

function boneSpec(b, i, seen) {
  plainObject(b, `bones[${i}]`);
  const n = name(b.name, `bones[${i}].name`);
  if (seen.has(n)) bad('Bone name already used: ' + n);
  if (b.parent && !seen.has(b.parent)) bad(`bones[${i}]: parent "${b.parent}" not found (create parents first)`);
  seen.add(n);
  return { name: n, parent: b.parent || null, origin: vec(b.pivot, 3, [0, 0, 0], 'pivot', LIMITS.coord), rotation: vec(b.rotation, 3, [0, 0, 0], 'rotation', LIMITS.angle) };
}
function addBones(list) {
  needProject();
  const seen = new Set(Group.all.map((g) => g.name));
  const specs = nonEmptyList(list, 'bones').map((b, i) => boneSpec(b, i, seen));
  Undo.initEdit({ outliner: true });
  specs.forEach((s) => new Group({ name: s.name, origin: s.origin, rotation: s.rotation }).init().addTo(s.parent ? findBone(s.parent) : 'root'));
  Undo.finishEdit(TITLE + ': add bones', { outliner: true });
  Canvas.updateAll();
  return { added: specs.map((s) => s.name) };
}
endpoints.add_bones = (p) => addBones(p.bones);

function cubeCorners(c, at) {
  if (c.from !== undefined || c.to !== undefined) return [vec(c.from, 3, null, at + '.from', LIMITS.coord), vec(c.to, 3, null, at + '.to', LIMITS.coord)];
  if (c.origin === undefined || c.size === undefined) bad(`${at}: give "from"+"to" or "origin"+"size"`);
  const from = vec(c.origin, 3, null, at + '.origin', LIMITS.coord);
  const size = vec(c.size, 3, null, at + '.size', LIMITS.coord);
  return [from, from.map((v, k) => v + size[k])];
}
function cubeBone(c, at) {
  if (c.bone === undefined && isJava()) return null;
  return findBone(c.bone) || bad(`${at}: bone "${c.bone}" not found (GeckoLib cubes must be inside a bone)`);
}
function boxUv() { return Project.box_uv !== undefined ? !!Project.box_uv : !!Format.box_uv; }
function cubeData(c, at, bone, from, to) {
  const center = from.map((v, k) => (v + to[k]) / 2);
  return {
    name: c.name ? name(c.name, at + '.name') : bone ? bone.name : 'cube', from, to,
    origin: vec(c.pivot, 3, bone ? bone.origin : center, at + '.pivot', LIMITS.coord),
    rotation: vec(c.rotation, 3, [0, 0, 0], at + '.rotation', LIMITS.angle),
    inflate: c.inflate === undefined ? 0 : num(c.inflate, at + '.inflate', LIMITS.inflate),
    uv_offset: vec(c.uv_offset, 2, [0, 0], at + '.uv_offset', LIMITS.uv),
    mirror_uv: !!c.mirror,
    box_uv: boxUv(),
  };
}
function cubeSpec(c, i) {
  const at = `cubes[${i}]`;
  plainObject(c, at);
  const bone = cubeBone(c, at);
  const [from, to] = cubeCorners(c, at);
  if (to.some((v, k) => v < from[k])) bad(`${at}: "to" must be >= "from" on every axis`);
  const faces = c.faces === undefined ? null : faceUvs(c.faces, at);
  return { bone, faces, data: cubeData(c, at, bone, from, to) };
}
function makeCube(s) {
  const cube = new Cube(s.data).init();
  cube.addTo(s.bone || 'root');
  if (Texture.all.length) cube.applyTexture(mainTexture(), true);
  if (s.faces) applyFaceUvs(cube, s.faces);
  return cube;
}
function addCubes(list) {
  needProject();
  const specs = nonEmptyList(list, 'cubes').map(cubeSpec);
  checkCubeTotal(Cube.all.length + specs.length);
  Undo.initEdit({ outliner: true, elements: [] });
  const made = specs.map(makeCube);
  Undo.finishEdit(TITLE + ': add cubes', { outliner: true, elements: made });
  Canvas.updateAll();
  return { added: made.length, cube_count: Cube.all.length };
}
function extent(withInflate) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  Cube.all.forEach((c) => [0, 1, 2].forEach((k) => {
    const pad = withInflate ? c.inflate : 0;
    min[k] = Math.min(min[k], c.from[k] - pad);
    max[k] = Math.max(max[k], c.to[k] + pad);
  }));
  return { min, max };
}
endpoints.add_cubes = (p) => addCubes(p.cubes);

const DISPLAY_KEYS = ['rotation', 'translation', 'scale'];

function needDisplay() {
  needProject();
  if (!Format.display_mode) bad('This project has no display settings. Use open_java_model or new_java_item.');
}
function checkSlot(slot) {
  if (!DisplayMode.slots.includes(slot)) bad(`Unknown display slot "${slot}". Use ${DisplayMode.slots.join(', ')}`);
  return slot;
}
function slotJson(slot) {
  const d = Project.display_settings[slot];
  if (!d) return null;
  return { rotation: d.rotation.slice(), translation: d.translation.slice(), scale: d.scale.map((v, k) => (d.mirror[k] ? -v : v)) };
}
function displayMap() {
  const out = {};
  DisplayMode.slots.forEach((s) => { if (Project.display_settings[s]) out[s] = slotJson(s); });
  return out;
}
function javaSummary() {
  const e = Cube.all.length ? extent(false) : null;
  return { parent: Project.parent || null, element_count: Cube.all.length, extent: e ? { from: e.min, to: e.max } : null, display: displayMap() };
}
function slotValues(slot, d) {
  const v = {};
  Object.keys(d || {}).forEach((k) => {
    if (!DISPLAY_KEYS.includes(k)) bad(`${slot}.${k}: only rotation, translation and scale can be set`);
    v[k] = vec(d[k], 3, null, `${slot}.${k}`);
  });
  if (v.translation && v.translation.some((x) => Math.abs(x) > 80)) bad(slot + '.translation must stay within -80..80');
  if (v.scale && v.scale.some((x) => Math.abs(x) > 4)) bad(slot + '.scale must stay within -4..4');
  return v;
}
function applySlot(slot, v, replace) {
  if (!Project.display_settings[slot]) Project.display_settings[slot] = new DisplaySlot(slot);
  const ds = Project.display_settings[slot];
  if (replace) ds.default();
  if (v.scale) ds.mirror = [false, false, false];
  ds.extend(v);
}
function setDisplay(display, replace) {
  needDisplay();
  plainObject(display, 'display');
  const plan = Object.keys(display).map((slot) => ({ slot: checkSlot(slot), v: slotValues(slot, display[slot]) }));
  Undo.initEdit({ display_slots: plan.map((x) => x.slot) });
  plan.forEach((x) => applySlot(x.slot, x.v, replace));
  Undo.finishEdit(TITLE + ': set display');
  if (Modes.display) DisplayMode.updateDisplayBase();
  return { set: plan.map((x) => x.slot), display: displayMap() };
}
function slotArg(p) {
  const d = {};
  DISPLAY_KEYS.forEach((k) => { if (p[k] !== undefined) d[k] = p[k]; });
  return { [p.slot]: d };
}
function displayArg(p) {
  if (p.preset) { const j = readJsonFile(p.preset).json; return j.display || j; }
  if (p.display) return p.display;
  if (p.slot) return slotArg(p);
  return bad('Give "display": {slot: {...}}, or "slot" with rotation/translation/scale, or "preset": "<path to a json with a display block>"');
}

const QUIET_DIALOGS = ['dialog_loose_texture', 'dialog_invalid_characters', 'dialog_generated_item_model', 'dialog_larger_cubes'];

function tryReadPng(full) {
  try {
    const t = checkPath(full, ['.png']);
    return t.fs.existsSync(t.full) ? readPngBytes(t) : null;
  } catch (e) { return null; }
}
function blankPng() { return blankCanvas(16, 16).toDataURL('image/png'); }
function siblingOrAssetPng(model, request) {
  const r = roots();
  const tail = /(?:^|[\\/])textures[\\/](.+)$/.exec(request);
  const sibling = tryReadPng(PathM.join(PathM.dirname(model.full), lastSegment(request)));
  if (sibling || !tail || !r.assets) return sibling;
  return tryReadPng(PathM.join(r.assets, 'textures', ...tail[1].split(/[\\/]/)));
}
// Blockbench falls back to reading the path itself (with no folder fence) whenever this loader returns
// nothing, so it always returns something: a PNG from the allowed folders, the explicit texture, or blank.
function javaTextureLoader(model, explicit) {
  const load = (s, base) => {
    if (!base.endsWith('.png')) return null;
    if (explicit && (explicit.single || lastSegment(explicit.full).toLowerCase() === base)) return explicit.bytes;
    return siblingOrAssetPng(model, s) || (explicit ? explicit.bytes : null);
  };
  return (req) => {
    const s = String(req || ''), base = lastSegment(s).toLowerCase();
    if (base.endsWith('.mcmeta')) return '{}';
    try { return load(s, base) || blankPng(); } catch (e) { return blankPng(); }
  };
}
const TEXTURE_REF = /^#?(?:[a-z0-9_.\-]+:)?[a-z0-9_.\-]+(?:\/[a-z0-9_.\-]+)*$/i;
function textureRefOk(v) {
  return typeof v === 'string' && !/^data:/i.test(v) && !PathM.isAbsolute(v) && !/^[A-Za-z]:[\\/]/.test(v)
    && !v.split('/').includes('..') && TEXTURE_REF.test(v);
}
/** Texture values in a Java model must be resource locations, never file paths or data URLs. */
function checkTextureRefs(json) {
  if (json.textures === undefined) return;
  const links = plainObject(json.textures, 'textures');
  Object.keys(links).forEach((k) => {
    const v = links[k] && typeof links[k] === 'object' ? links[k].sprite : links[k];
    if (!textureRefOk(v)) bad(`Texture "${k}" must be a resource location such as "minecraft:item/iron_sword", not a file path or a data URL`);
  });
}
function quietly(fn) {
  const saved = QUIET_DIALOGS.filter((k) => settings[k]).map((k) => [k, settings[k].value]);
  saved.forEach(([k]) => { settings[k].value = false; });
  try { return fn(); } finally { saved.forEach(([k, v]) => { settings[k].value = v; }); }
}
function linkFor(links, id) {
  let link = links[id];
  if (link && typeof link === 'object') link = link.sprite;
  const seen = new Set();
  while (typeof link === 'string' && link.startsWith('#') && links[link.slice(1)] && !seen.has(link)) {
    seen.add(link);
    link = links[link.slice(1)];
  }
  return typeof link === 'string' && !link.startsWith('#') ? link : null;
}
function restoreTextureLinks(json) {
  const links = json.textures || {};
  Texture.all.forEach((tex) => {
    const m = /^(?:([a-z0-9_.\-]+):)?(?:(.*)\/)?([^/]+)$/.exec(linkFor(links, tex.id) || '');
    if (!m) return;
    tex.namespace = m[1] || 'minecraft';
    tex.folder = m[2] || '';
    tex.name = m[3] + '.png';
  });
}
function explicitTexture(p, json) {
  if (!p.texture) return null;
  const t = checkPath(p.texture, ['.png']);
  const keys = Object.keys(json.textures || {}).filter((k) => k !== 'particle');
  return { full: t.full, bytes: readPngBytes(t), single: keys.length <= 1 };
}

function tabs() { return typeof ModelProject !== 'undefined' ? ModelProject.all : []; }
function samePath(a, b) { return typeof a === 'string' && a !== '' && PathM.relative(PathM.resolve(a), b) === ''; }
function findTab(path) {
  return tabs().find((x) => [x.stonecut_path, x.save_path, x.export_path].some((q) => samePath(q, path)));
}
function undoCount(x) {
  const undo = x.undo || (x._static && x._static.properties && x._static.properties.undo);
  return undo && Array.isArray(undo.history) ? undo.history.length : Infinity;
}
async function closeForReload(tab) {
  const edits = undoCount(tab);
  if (edits !== 0) bad(`Tab "${tab.name}" has ${edits === Infinity ? 'unknown' : edits} edit(s); not reloaded, so nothing is lost. Save or undo them in Blockbench first.`);
  if (await tab.close(true) === false) bad(`Blockbench would not close tab "${tab.name}" for the reload`);
  return true;
}
async function existingTab(path, p) {
  const open = p.reopen === true ? null : findTab(path);
  if (!open) return { open: null, reloaded: false };
  if (p.reload === true) return { open: null, reloaded: await closeForReload(open) };
  open.select();
  return { open, reloaded: false };
}
function sameTab(a, b) {
  const count = (x, key) => (Array.isArray(x[key]) ? x[key].length : -1);
  return a.name === b.name && a.format === b.format && count(a, 'elements') === count(b, 'elements')
    && count(a, 'textures') === count(b, 'textures');
}
function readJsonFile(p) {
  const t = checkPath(p, ['.json']);
  checkFileSize(t.fs.statSync(t.full).size, t.full);
  const raw = t.fs.readFileSync(t.full);
  if (isPng(raw)) bad(`${t.full} is a PNG image, not a JSON model. Pass the .json as the model and the .png as "texture".`);
  const text = raw.toString('utf8').replace(/^﻿/, '');
  try { return { t, text, json: JSON.parse(text) }; } catch (e) { return bad('Cannot read JSON ' + t.full + ': ' + e.message); }
}
function tabList() {
  return tabs().map((x) => ({ name: x.name, format: x.format ? x.format.id : null, selected: x === Project, edits: undoCount(x) }));
}
async function closeCopies(n, closed) {
  const same = tabs().filter((x) => x.name === n);
  for (const extra of same.slice(1)) {
    if (!sameTab(same[0], extra) || undoCount(extra) !== 0) continue;
    if (await extra.close(true) !== false) closed.push(n);
  }
  return same.length > 0;
}
endpoints.close_tab = async (p) => {
  if (p.duplicates !== true && p.name === undefined) bad('Give "name" (a tab name) or "duplicates": true');
  const names = p.duplicates === true ? [...new Set(tabs().map((x) => x.name))] : [name(p.name, 'name')];
  const before = Project, closed = [];
  let kept = 0;
  for (const n of names) if (await closeCopies(n, closed)) kept++;
  if (before && tabs().includes(before)) before.select();
  return { closed, kept, tabs: tabs().length };
};

const CONFIRM_TIMEOUT_MS = 120000;
const NEVER_ASK = ['ping', 'status', 'display_get'];
const SHOT_ENDPOINTS = ['screenshot', 'display_screenshot'];
const EXPORT_KEYS = ['geo', 'animation', 'model', 'texture'];

/** A value shown in the question as a code span, so Markdown in it (links, images) is never rendered. */
function code(v) { return '`' + String(v).replace(/[`\r\n]/g, '').slice(0, 300) + '`'; }
function existingFile(path, exts) {
  try {
    const t = checkPath(path, exts);
    return t.fs.existsSync(t.full) ? t.full : null;
  } catch (e) { return null; }
}
function replacedFiles(ep, p) {
  if (p.overwrite !== true) return [];
  if (ep === 'export') return EXPORT_KEYS.filter((k) => p[k]).map((k) => existingFile(p[k], ['.json', '.png'])).filter(Boolean);
  if (SHOT_ENDPOINTS.includes(ep) && p.path) return [existingFile(p.path, ['.png'])].filter(Boolean);
  return [];
}
function reloadedTab(p) {
  if (p.reload !== true || p.reopen === true) return null;
  try { return findTab(checkPath(p.geo || p.model, ['.json']).full) || null; } catch (e) { return null; }
}
function closing(ep, p) {
  if (ep === 'close_tab') return p.duplicates === true ? 'close unedited duplicate tabs' : `close unedited duplicates of the tab ${code(name(p.name, 'name'))}`;
  const tab = (ep === 'open_model' || ep === 'open_java_model') ? reloadedTab(p) : null;
  return tab ? `close the tab ${code(tab.name)} and load its file again` : null;
}
/** What a call would do that the confirm setting asks about, or null when no question is needed. */
function confirmReason(ep, p, mode) {
  if (mode === 'never' || NEVER_ASK.includes(ep)) return null;
  const what = [];
  const files = replacedFiles(ep, p);
  if (files.length) what.push('replace ' + files.map(code).join(', '));
  const close = closing(ep, p);
  if (close) what.push(close);
  if (what.length) return what.join(' and ');
  if (mode === 'every_change' && !SHOT_ENDPOINTS.includes(ep)) return 'run ' + code(ep);
  return null;
}
function askPerson(what) {
  return new Promise((resolve) => {
    let done = false, box = null;
    const finish = (yes) => { if (!done) { done = true; resolve(yes); } };
    const timer = setTimeout(() => {
      finish(false);
      try { if (box && typeof box.close === 'function') box.close(1); } catch (e) { /* the box may be gone already */ }
    }, CONFIRM_TIMEOUT_MS);
    box = Blockbench.showMessageBox({
      title: TITLE, icon: 'warning', buttons: ['Allow', 'Deny'], confirm: 0, cancel: 1,
      message: 'Your AI helper asks to ' + what + '.\n\nAllow it? (Deny is chosen by itself after two minutes.)',
    }, (button) => { clearTimeout(timer); finish(button === 0); });
  });
}
async function confirmIfNeeded(ep, p, c) {
  const what = confirmReason(ep, p, c.confirm);
  if (what && !(await askPerson(what))) bad(`The person did not allow this in Blockbench (${what}). "confirm" is "${c.confirm}" in ${configFile()}.`);
}

const VIEWS = { front: [0, 10], back: [180, 10], right: [-90, 10], left: [90, 10], top: [0, 89], iso: [45, 30], iso_back: [225, 30] };

function writePng(url, path, autoName, overwrite) {
  const exportOn = conf().allow_export;
  if (path && !exportOn) bad(`Export is turned off ("allow_export": false in ${configFile()}), so screenshots only go to new files with automatic names in the output folder. Leave out "path".`);
  const target = checkPath(path || 'output:' + safeFileName(autoName), ['.png']);
  writeOut(target, Buffer.from(pngBase64(url), 'base64'), exportOn && (!path || overwrite === true));
  return { path: target.full, data: pngBase64(url) };
}
function bounds() {
  if (!Cube.all.length) return { center: [0, 8, 0], radius: 16 };
  const { min, max } = extent(true);
  const size = max.map((v, k) => v - min[k]);
  return { center: min.map((v, k) => v + size[k] / 2), radius: Math.max(4, Math.hypot(...size) / 2) };
}
function sceneOffset(k) {
  return typeof scene !== 'undefined' && scene && scene.position ? scene.position.getComponent(k) : 0;
}
function sceneBounds() {
  const { center, radius } = bounds();
  return { radius, center: center.map((v, k) => v + sceneOffset(k)) };
}
function saveCamera(preview) {
  return { pos: preview.camera.position.clone(), target: preview.controls.target.clone(), ortho: preview.isOrtho, mode: modeId() };
}
function restoreCamera(preview, saved, anim) {
  preview.camera.position.copy(saved.pos);
  preview.controls.target.copy(saved.target);
  if (saved.ortho !== preview.isOrtho) preview.setProjectionMode(saved.ortho);
  if (preview.controls.update) preview.controls.update();
  if (anim) Timeline.setTime(0);
  if (modeId() !== saved.mode && Modes.options[saved.mode]) Modes.options[saved.mode].select();
}
function aim(preview, center, angle, dist) {
  const yaw = angle[0] * Math.PI / 180, pitch = angle[1] * Math.PI / 180;
  preview.controls.target.set(center[0], center[1], center[2]);
  preview.camera.position.set(center[0] - Math.sin(yaw) * Math.cos(pitch) * dist,
    center[1] + Math.sin(pitch) * dist, center[2] - Math.cos(yaw) * Math.cos(pitch) * dist);
  if (preview.controls.update) preview.controls.update();
}
function previewShot(preview, w, h, crop) {
  return new Promise((res) => Screencam.screenshotPreview(preview, { width: w, height: h, crop }, res));
}
function viewAngles(p) {
  const views = Array.isArray(p.views) && p.views.length ? p.views : [p.view || (p.yaw !== undefined ? 'custom' : 'iso')];
  return views.map((v) => ({ view: v, angle: v === 'custom'
    ? [num(p.yaw, 'yaw'), p.pitch === undefined ? 15 : num(p.pitch, 'pitch')]
    : VIEWS[v] || bad('Unknown view "' + v + '". Use ' + Object.keys(VIEWS).join(', ') + ' or yaw/pitch') }));
}
function posePreview(p, prevMode) {
  const anim = p.animation ? findAnim(p.animation) : null;
  const time = anim ? Math.max(0, Math.min(anim.length, p.time === undefined ? 0 : num(p.time, 'time'))) : null;
  if (anim) { Modes.options.animate.select(); anim.select(); Timeline.setTime(time); Animator.preview(); }
  else if (prevMode === 'animate') Modes.options.edit.select();
  return { anim, time };
}
async function shootViews(preview, list, o) {
  if (preview.isOrtho) preview.setProjectionMode(false);
  const { center, radius } = sceneBounds();
  const fov = (preview.camera.fov || 45) * Math.PI / 180;
  const dist = o.p.distance ? num(o.p.distance, 'distance') : (radius * 1.2) / Math.sin(fov / 2);
  const files = [];
  for (const v of list) files.push(await shootView(preview, v, center, dist, o));
  return files;
}
async function shootView(preview, v, center, dist, o) {
  aim(preview, center, v.angle, dist);
  if (o.pose.anim) Animator.preview();
  const url = await previewShot(preview, o.w, o.h);
  const tag = o.pose.anim ? `_${o.pose.anim.name}_t${o.pose.time}` : '';
  const auto = `${Project.name || 'model'}_${v.view}${tag}_${Date.now()}.png`;
  return Object.assign({ view: v.view, yaw: v.angle[0], pitch: v.angle[1] }, writePng(url, o.p.path, auto, o.p.overwrite));
}
function guiShot(dp, size) {
  return new Promise((res) => Canvas.withoutGizmos(() => {
    dp.render();
    const zoom = dp.camOrtho.zoom * devicePixelRatio, resolution = 256 * zoom;
    const sx = dp.width * devicePixelRatio / 2 - dp.controls.target.x * zoom * 40 - resolution / 2;
    const sy = dp.height * devicePixelRatio / 2 + dp.controls.target.y * zoom * 40 - resolution / 2;
    const c = blankCanvas(size, size);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dp.canvas, sx, sy, resolution, resolution, 0, 0, size, size);
    res(c.toDataURL('image/png'));
  }));
}
async function displayShot(slot, w, h, crop) {
  DisplayMode.load(slot);
  await sleep(250);
  const dp = Preview.all.find((x) => x.id === 'display') || Preview.selected;
  if (slot === 'gui') return guiShot(dp, Math.min(w, h));
  return previewShot(dp, w, h, crop);
}

function boneList() {
  return Group.all.map((g) => ({ name: g.name, parent: g.parent instanceof Group ? g.parent.name : null,
    pivot: g.origin, rotation: g.rotation, cubes: g.children.filter((c) => c instanceof Cube).length }));
}
function projectSummary() {
  const out = {
    name: Project.name, format: Format.id, format_name: Format.name, is_geckolib: isGecko(),
    mode: Mode.selected ? Mode.selected.id : null, box_uv: !!Project.box_uv,
    texture_uv_size: [Project.texture_width, Project.texture_height],
    textures: Texture.all.map((t) => ({ name: t.name, size: [t.width, t.height] })),
    bones: boneList(), cube_count: Cube.all.length,
    animations: Animator.animations.map((a) => ({ name: a.name, loop: a.loop, length: a.length })),
  };
  return isJava() ? Object.assign(out, javaSummary()) : out;
}
function textureSize(p, def) {
  const w = checkTextureSide(intOr(p.texture_width, def, 'texture_width', 1, 4096), 'texture_width');
  return [w, checkTextureSide(intOr(p.texture_height, w, 'texture_height', 1, 4096), 'texture_height')];
}
function startProject(format, n, size) {
  newProject(format);
  Project.name = n;
  Project.texture_width = size[0];
  Project.texture_height = size[1];
}

endpoints.ping = () => ({ pong: true, version: VERSION });

endpoints.status = () => {
  const out = { version: VERSION, geckolib_plugin_installed: geckoInstalled(), roots: roots(), settings: settingsSummary(), project: null, projects: tabList() };
  if (!geckoInstalled()) out.warning = GECKO_MISSING;
  if (Project) out.project = projectSummary();
  return out;
};

endpoints.new_project = (p) => {
  const n = name(p.name, 'name');
  const size = textureSize(p, 64);
  const modid = p.modid === undefined ? null : namespace(p.modid, 'modid');
  const gecko = geckoInstalled();
  startProject(gecko ? Formats.geckolib_model : Formats.bedrock, n, size);
  Project.geometry_name = n;
  if (gecko) Project.geckolib_model_type = 'Entity';
  if (gecko && modid) Project.geckolib_modid = modid;
  Canvas.updateAll();
  return Object.assign({ format: Format.id, name: n, texture_uv_size: size }, gecko ? {} : { warning: GECKO_MISSING });
};

endpoints.new_java_item = (p) => {
  const n = name(p.name, 'name');
  const size = textureSize(p, 16);
  const ns = p.namespace === undefined ? DEFAULT_NAMESPACE : namespace(p.namespace, 'namespace');
  const display = p.display || p.preset ? displayArg(p) : null;
  startProject(Formats.java_block, n, size);
  Project.stonecut_namespace = ns;
  if (display) setDisplay(display, true);
  Canvas.updateAll();
  return Object.assign({ format: Format.id, name: n, namespace: ns, texture_uv_size: size }, javaSummary());
};

function geoSummary() { return { format: Format.id, name: Project.name, bones: Group.all.length, cubes: Cube.all.length }; }
function checkGeoJson(json, full) {
  if (json && (json.elements || json.parent) && !json['minecraft:geometry']) bad('This is a Java block/item model. Use open_java_model for it: ' + full);
  if (!json || !Array.isArray(json['minecraft:geometry'])) bad('Not a .geo.json model: ' + full);
  const bones = geoBones(json);
  if (bones.length > LIMITS.bones) bad(`The model has ${bones.length} bones; the limit is ${LIMITS.bones}`);
  checkCubeTotal(geoCubeCount(bones));
}
function geoBones(json) {
  const list = (x) => (Array.isArray(x) ? x : []);
  return list(json['minecraft:geometry']).flatMap((g) => list(g && g.bones));
}
/** Cubes plus mesh polygons, so a model cannot hide its size in poly_mesh. */
function geoCubeCount(bones) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const polys = (b) => (b && b.poly_mesh ? list(b.poly_mesh.polys).length || Object.keys(b.poly_mesh.polys || {}).length : 0);
  return bones.reduce((n, b) => n + list(b && b.cubes).length + polys(b), 0);
}
function checkJavaJson(json, full) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) bad('Not a model object: ' + full);
  if (json['minecraft:geometry']) bad('This is a Bedrock/GeckoLib .geo.json. Use open_model for it.');
  if (!Array.isArray(json.elements)) bad(json.parent ? `No elements: this file only points at its parent "${json.parent}". Open the model that has the elements.` : 'No "elements" in ' + full);
  checkCubeTotal(json.elements.length);
  checkTextureRefs(json);
}
function tagProject(tabName, full) {
  Project.name = tabName;
  Project.stonecut_path = full;
}
function loadGeo(json, full) {
  try {
    Codecs.bedrock.load(json, { path: full, no_file: true }, { switch_to_existing_tab: false });
    if (!(Project instanceof ModelProject)) bad('Blockbench closed the new tab while loading');
    tagProject(PathM.basename(full).replace(/(\.geo)?\.json$/i, ''), full);
    if (geckoInstalled() && !isGecko()) Formats.geckolib_model.convertTo();
  } catch (e) { bad(`Blockbench could not load ${full}: ${e.message}`); }
}
function loadAnimations(path) {
  const { t, text, json } = readJsonFile(path);
  Animator.loadFile({ path: t.full, content: text, json });
  return Animator.animations.map((x) => x.name);
}
function loadJava(json, src, explicit) {
  try {
    quietly(() => Codecs.java_block.load(json, { path: src.full, no_file: true },
      { resolve_parent: false, externalDataLoader: javaTextureLoader(src, explicit) }));
    restoreTextureLinks(json);
  } catch (e) { bad(`Blockbench could not load ${src.full}: ${e.message}`); }
}
function javaOpenSummary(src) {
  const textures = Texture.all.map((x) => ({ id: x.id, link: x.javaTextureLink(), size: [x.width, x.height] }));
  return Object.assign({ format: Format.id, name: Project.name, path: src.full, textures }, javaSummary());
}

endpoints.open_model = async (p) => {
  const { t: geo, json } = readJsonFile(p.geo);
  checkGeoJson(json, geo.full);
  if (p.animation) checkPath(p.animation, ['.json']);
  if (p.texture) checkPath(p.texture, ['.png']);
  const tab = await existingTab(geo.full, p);
  if (tab.open) return Object.assign({ already_open: true }, geoSummary());
  loadGeo(json, geo.full);
  const out = Object.assign(geoSummary(), tab.reloaded ? { reloaded: true } : {});
  if (p.animation) out.animations = loadAnimations(p.animation);
  if (p.texture) out.texture = await importTexture(p.texture, false);
  if (!geckoInstalled()) out.warning = GECKO_MISSING;
  return out;
};

endpoints.open_java_model = async (p) => {
  const { t: src, json } = readJsonFile(p.model);
  checkJavaJson(json, src.full);
  const explicit = explicitTexture(p, json);
  const tabName = p.name ? name(p.name, 'name') : PathM.basename(src.full).replace(/\.json$/i, '');
  const tab = await existingTab(src.full, p);
  if (tab.open) return Object.assign({ already_open: true, format: Format.id, name: Project.name, path: src.full }, javaSummary());
  loadJava(json, src, explicit);
  tagProject(tabName, src.full);
  await Promise.all(Texture.all.map(imageReady));
  Canvas.updateAll();
  return Object.assign(javaOpenSummary(src), tab.reloaded ? { reloaded: true } : {});
};

function leaveDisplay(prevMode, prevSlot) {
  if (prevMode === 'display') DisplayMode.load(prevSlot);
  else if (Modes.options[prevMode]) Modes.options[prevMode].select();
}
async function shootSlot(slot, w, h, p) {
  const crop = p.crop === undefined ? !slot.startsWith('firstperson') : !!p.crop;
  const url = await displayShot(slot, w, h, crop);
  const file = writePng(url, p.path, `${Project.name || 'model'}_${slot}_${Date.now()}.png`, p.overwrite);
  return Object.assign({ slot, crop, display: slotJson(slot) }, file);
}

endpoints.display_get = (p) => {
  needDisplay();
  if (p.slot !== undefined) checkSlot(p.slot);
  const all = displayMap();
  return { display: p.slot ? { [p.slot]: all[p.slot] || null } : all };
};

endpoints.display_set = (p) => setDisplay(displayArg(p), p.replace === true);

endpoints.display_screenshot = async (p) => {
  needDisplay();
  const slots = (Array.isArray(p.slots) && p.slots.length ? p.slots : [p.slot || 'firstperson_righthand']).map(checkSlot);
  if (p.path && slots.length > 1) bad('path can only be used with a single slot');
  const w = intOr(p.width, 768, 'width', 64, 2048), h = intOr(p.height, 432, 'height', 64, 2048);
  const prevMode = modeId(), prevSlot = DisplayMode.display_slot;
  try {
    if (!Modes.display) Modes.options.display.select();
    const files = [];
    for (const slot of slots) files.push(await shootSlot(slot, w, h, p));
    return { files, size: [w, h] };
  } finally { leaveDisplay(prevMode, prevSlot); }
};

function rectArgs(p) { return [p.x, p.y, p.w, p.h].map((v, i) => int(v, ['x', 'y', 'w', 'h'][i], 0, 4096)); }
function pixelArgs(pixels) {
  if (!Array.isArray(pixels) || !pixels.length || pixels.length > 65536) bad('pixels must be a list of [x, y, colour] (max 65536)');
  return pixels.map((q, i) => {
    if (!Array.isArray(q) || q.length !== 3) bad(`pixels[${i}] must be [x, y, colour]`);
    return [int(q[0], 'x', 0, 4095), int(q[1], 'y', 0, 4095), color(q[2])];
  });
}
function paletteArg(palette) {
  plainObject(palette, 'palette');
  const pal = {};
  Object.keys(palette).forEach((k) => {
    if (k.length !== 1) bad('palette keys must be single characters');
    pal[k] = color(palette[k]);
  });
  return pal;
}
function checkDrawWork(rows, scale) {
  const cells = rows.reduce((n, r) => n + r.length, 0);
  if (cells > LIMITS.drawCells) bad(`${cells} characters in rows; the limit is ${LIMITS.drawCells}`);
  if (cells * scale * scale > LIMITS.drawPixels) bad(`rows times scale would paint ${cells * scale * scale} pixels; the limit is ${LIMITS.drawPixels}`);
}
function drawRows(ctx, rows, pal, at) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (Object.prototype.hasOwnProperty.call(pal, ch)) fillPx(ctx, at.x + x * at.scale, at.y + y * at.scale, at.scale, at.scale, pal[ch]);
  }));
}
function textureCanvas(p, w, h) {
  const c = blankCanvas(w, h);
  const ctx = c.getContext('2d');
  if (p.fill !== undefined && color(p.fill)) { ctx.fillStyle = p.fill; ctx.fillRect(0, 0, w, h); }
  const old = Texture.all[0];
  const kept = !!(old && p.keep_pixels !== false);
  if (kept) ctx.drawImage(old.canvas, 0, 0);
  return { c, kept };
}

endpoints.texture_create = async (p) => {
  needProject();
  const w = checkTextureSide(intOr(p.width, Project.texture_width, 'width', 1, 4096), 'width');
  const h = checkTextureSide(intOr(p.height, w, 'height', 1, 4096), 'height');
  const texName = p.name === undefined ? undefined : name(p.name, 'name');
  const { c, kept } = textureCanvas(p, w, h);
  await setTextureImage(c.toDataURL('image/png'), texName);
  if (p.set_uv_size !== false) { Project.texture_width = w; Project.texture_height = h; }
  Canvas.updateAll();
  return { size: [w, h], kept_old_pixels: kept, texture_uv_size: [Project.texture_width, Project.texture_height] };
};

endpoints.texture_fill_rect = (p) => {
  const c = color(p.color);
  const r = rectArgs(p);
  return paint('fill rect', (ctx) => fillPx(ctx, r[0], r[1], r[2], r[3], c));
};

endpoints.texture_set_pixels = (p) => {
  const px = pixelArgs(p.pixels);
  return paint('set pixels', (ctx) => px.forEach((q) => fillPx(ctx, q[0], q[1], 1, 1, q[2])));
};

endpoints.texture_draw = (p) => {
  const at = { x: intOr(p.x, 0, 'x', 0, 4095), y: intOr(p.y, 0, 'y', 0, 4095), scale: intOr(p.scale, 1, 'scale', 1, 64) };
  if (!Array.isArray(p.rows) || !p.rows.every((r) => typeof r === 'string')) bad('rows must be a list of strings');
  checkDrawWork(p.rows, at.scale);
  const pal = paletteArg(p.palette);
  return paint('draw', (ctx) => drawRows(ctx, p.rows, pal, at));
};

endpoints.texture_import = async (p) => { needProject(); return importTexture(p.path, p.set_uv_size === true); };

const CHANNELS = ['rotation', 'position', 'scale'];
const INTERPOLATIONS = ['linear', 'catmullrom', 'step', 'bezier'];

function loopArg(loop) {
  const v = loop === true || loop === undefined ? 'loop' : loop === false ? 'once' : loop;
  if (!['loop', 'once', 'hold'].includes(v)) bad('loop must be true/false or "loop", "once", "hold"');
  return v;
}
function keyValue(v) { return typeof v === 'number' || typeof v === 'string' ? v : bad('keyframe values must be numbers or Molang strings'); }
function keyframeSpec(k, interp) {
  plainObject(k, 'keyframe');
  const interpolation = k.interpolation || interp;
  if (!INTERPOLATIONS.includes(interpolation)) bad('interpolation must be ' + INTERPOLATIONS.join(', '));
  const v = typeof k.value === 'number' ? [k.value, k.value, k.value] : k.value;
  if (!Array.isArray(v) || v.length !== 3) bad('value must be [x, y, z] (or one number for all three)');
  const time = num(k.time, 'time', LIMITS.seconds);
  if (time < 0) bad('time must be >= 0');
  return { time, interpolation, data_points: [{ x: keyValue(v[0]), y: keyValue(v[1]), z: keyValue(v[2]) }] };
}
function trackSpec(t, i, interp) {
  plainObject(t, `tracks[${i}]`);
  const bone = findBone(t.bone) || bad(`tracks[${i}]: bone "${t.bone}" not found`);
  const channel = t.channel || 'rotation';
  if (!CHANNELS.includes(channel)) bad('channel must be ' + CHANNELS.join(', '));
  const kfs = nonEmptyList(t.keyframes, `tracks[${i}].keyframes`).map((k) => keyframeSpec(k, t.interpolation || interp));
  return { bone, channel, kfs };
}
function addTrack(anim, t, made) {
  const animator = anim.getBoneAnimator(t.bone) || bad('Cannot animate bone ' + t.bone.name);
  t.kfs.forEach((k) => made.push(animator.addKeyframe(Object.assign({ channel: t.channel }, k))));
  return Math.max(...t.kfs.map((k) => k.time));
}

endpoints.add_animation = (p) => {
  needProject();
  if (!Format.animation_mode) bad('This project format has no animations.');
  const n = name(p.name, 'name');
  if (Animator.animations.some((a) => a.name === n)) bad('Animation already exists: ' + n);
  const loop = loopArg(p.loop);
  const length = p.length === undefined ? 1 : num(p.length, 'length', LIMITS.seconds);
  if (length < 0) bad('length must be >= 0');
  Undo.initEdit({ animations: [] });
  const anim = new (animClass())({ name: n, loop, length }).add();
  anim.setLength(length);
  Undo.finishEdit(TITLE + ': add animation', { animations: [anim] });
  return { name: anim.name, loop: anim.loop, length: anim.length };
};

endpoints.add_keyframes = (p) => {
  needProject();
  const anim = findAnim(p.animation);
  const tracks = nonEmptyList(p.tracks, 'tracks');
  const total = tracks.reduce((n, t) => n + (t && Array.isArray(t.keyframes) ? t.keyframes.length : 0), 0);
  if (total > LIMITS.keyframes) bad(`${total} keyframes in one call; the limit is ${LIMITS.keyframes}`);
  const plan = tracks.map((t, i) => trackSpec(t, i, p.interpolation || 'linear'));
  Undo.initEdit({ keyframes: [] });
  const made = [];
  const maxTime = Math.max(...plan.map((t) => addTrack(anim, t, made)));
  if (maxTime > anim.length) anim.setLength(maxTime);
  Undo.finishEdit(TITLE + ': add keyframes', { keyframes: made });
  if (modeId() === 'animate') Animator.preview();
  return { added: made.length, animation: anim.name, length: anim.length };
};

const EXPORTERS = {
  model: () => Codecs.java_block.compile({ prevent_dialog: true }),
  geo: () => Codecs.bedrock.compile(),
  animation: animationText,
  texture: () => Buffer.from(mainTexture().getBase64(), 'base64'),
};

function animationText() {
  const data = Animator.buildFile(null, Animator.animations.map((a) => a.name));
  return typeof autoStringify === 'function' ? autoStringify(data) : JSON.stringify(data, null, '\t');
}
function modelTarget(path) {
  if (!isJava()) bad('"model" exports a Java item model; open one with open_java_model or new_java_item first.');
  if (/\.(geo|animation)\.json$/i.test(path)) bad('"model" must be a plain .json name, not .geo.json / .animation.json');
  return checkPath(path, ['.json']);
}
function exportTargets(p) {
  if (p.geo && isJava()) bad('This is a Java item project; export it with "model", not "geo".');
  const t = {};
  if (p.model) t.model = modelTarget(p.model);
  if (p.geo) t.geo = checkPath(p.geo, ['.geo.json']);
  if (p.animation) t.animation = checkPath(p.animation, ['.animation.json']);
  if (p.texture) t.texture = checkPath(p.texture, ['.png']);
  if (t.animation && !Animator.animations.length) bad('No animations to export');
  if (t.texture) mainTexture();
  return t;
}

endpoints.screenshot = async (p) => {
  needProject();
  const list = viewAngles(p);
  const w = intOr(p.width, 512, 'width', 64, 2048), h = intOr(p.height, 512, 'height', 64, 2048);
  if (p.path && list.length > 1) bad('path can only be used with a single view');
  const preview = Preview.selected;
  const saved = saveCamera(preview);
  let pose = { anim: null, time: null };
  try {
    pose = posePreview(p, saved.mode);
    const files = await shootViews(preview, list, { w, h, pose, p });
    return { files, animation: pose.anim ? pose.anim.name : null, time: pose.time, size: [w, h] };
  } finally { restoreCamera(preview, saved, pose.anim); }
};

endpoints.export = (p) => {
  if (!conf().allow_export) bad(`Export is turned off ("allow_export": false in ${configFile()}). Ask the person to change it if they want files written.`);
  needProject();
  if (!p.geo && !p.animation && !p.texture && !p.model) bad('Give at least one of geo, animation, texture, model');
  const t = exportTargets(p);
  Object.values(t).forEach((x) => refuseExisting(x, p.overwrite === true));
  const content = {};
  Object.keys(t).forEach((k) => { content[k] = EXPORTERS[k](); checkFileSize(Buffer.byteLength(content[k]), t[k].full); });
  const written = Object.keys(t).map((k) => writeOut(t[k], content[k], true));
  const out = { written, format: Format.id };
  if (!isGecko() && (t.geo || t.animation)) out.warning = 'Project is not in GeckoLib format; files were written with the plain Bedrock codec.';
  return out;
};

const STATUS = { 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 411: 'Length Required', 413: 'Payload Too Large', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 431: 'Request Header Fields Too Large', 503: 'Service Unavailable' };
const MAX_HEAD = 16 * 1024;
const MAX_CONNECTIONS = 8;
const HEADER_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 300000;
const PROOF_LABEL = 'stonecut-bridge-proof:';

function reply(sock, code, obj) {
  if (sock.destroyed) return;
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = `HTTP/1.1 ${code} ${STATUS[code] || 'Error'}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`;
  sock.end(Buffer.concat([Buffer.from(head, 'latin1'), body]));
}
function sha(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest(); }
/** Compares fixed-size hashes, so any header text (any length, any characters) is safe to compare. */
function tokenOk(t) {
  if (typeof t !== 'string' || !state.token) return false;
  return crypto.timingSafeEqual(sha(t), sha(state.token));
}
/** POST /hello {nonce}: proves this bridge holds the token without anyone sending it. Needs no token. */
function helloProof(params) {
  if (!params || typeof params.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(params.nonce)) return null;
  return crypto.createHmac('sha256', state.token).update(PROOF_LABEL + params.nonce).digest('hex');
}
function refusal(method, h, ep) {
  const host = String(h.host || '').replace(/:\d+$/, '').toLowerCase();
  if (h.origin !== undefined || !['127.0.0.1', 'localhost'].includes(host)) return [403, 'Forbidden'];
  const hello = ep === 'hello';
  if (!hello && !tokenOk(h[TOKEN_HEADER])) return [401, 'Missing or wrong X-Stonecut-Token'];
  if (method !== 'POST') return [405, 'Use POST /<endpoint>'];
  if (!/^application\/json\s*(;|$)/i.test(h['content-type'] || '')) return [415, 'Content-Type must be application/json'];
  if (!hello && !Object.prototype.hasOwnProperty.call(endpoints, ep)) return [404, 'Unknown endpoint: ' + ep];
  return null;
}
function parseBody(body) {
  try {
    const v = body ? JSON.parse(body) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}
async function runEndpoint(sock, ep, params) {
  try {
    await confirmIfNeeded(ep, params, conf());
    reply(sock, 200, { ok: true, result: await endpoints[ep](params) });
  }
  catch (e) { console.warn('[' + TITLE + ']', ep, e); reply(sock, 422, { ok: false, error: String((e && e.message) || e) }); }
}
function handle(sock, ep, body) {
  const params = parseBody(body);
  if (!params) return reply(sock, 400, { ok: false, error: 'Body must be a JSON object' });
  if (ep === 'hello') {
    const proof = helloProof(params);
    return proof ? reply(sock, 200, { ok: true, result: { proof } }) : reply(sock, 400, { ok: false, error: 'Give "nonce": 64 hex characters' });
  }
  state.queue = state.queue.then(() => runEndpoint(sock, ep, params));
}
function parseHead(buf, end) {
  const lines = buf.slice(0, end).toString('latin1').split('\r\n');
  const [method, target] = lines[0].split(' ');
  const h = {};
  lines.slice(1).forEach((l) => { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
  return { method, target, h };
}
/** Reads the headers and refuses at once if they are wrong, before any body is collected. */
function takeHead(sock, c) {
  const fail = (code, error) => { reply(sock, code, { ok: false, error }); return true; };
  const buf = Buffer.concat(c.chunks);
  c.chunks = [buf];
  const end = buf.indexOf('\r\n\r\n');
  if (end < 0) return buf.length > MAX_HEAD ? fail(431, 'Headers too large') : false;
  const head = parseHead(buf, end);
  if (head.h['transfer-encoding']) return fail(411, 'Send a Content-Length body');
  c.len = parseInt(head.h['content-length'] || '0', 10) || 0;
  if (c.len < 0 || c.len > MAX_BODY) return fail(413, 'Request too large');
  c.ep = String(head.target || '').split('?')[0].replace(/^\/+/, '');
  const no = refusal(head.method, head.h, c.ep);
  if (no) return fail(no[0], no[1]);
  c.bodyStart = end + 4;
  sock.setTimeout(REQUEST_TIMEOUT_MS);
  return false;
}
function takeRequest(sock, c) {
  if (c.bodyStart === undefined && takeHead(sock, c)) return true;
  if (c.bodyStart === undefined || c.size < c.bodyStart + c.len) return false;
  const buf = Buffer.concat(c.chunks);
  handle(sock, c.ep, buf.slice(c.bodyStart, c.bodyStart + c.len).toString('utf8'));
  return true;
}
function onConnection(sock) {
  state.connections = (state.connections || 0) + 1;
  sock.on('close', () => { state.connections -= 1; });
  sock.on('error', () => sock.destroy());
  if (state.connections > MAX_CONNECTIONS) return reply(sock, 503, { ok: false, error: 'Too many connections' });
  const c = { chunks: [], size: 0, done: false };
  sock.setTimeout(state.headerTimeoutMs || HEADER_TIMEOUT_MS, () => sock.destroy());
  sock.on('data', (chunk) => {
    if (c.done) return;
    c.chunks.push(chunk);
    c.size += chunk.length;
    c.done = takeRequest(sock, c);
  });
}

function notify(msg, ms) { Blockbench.showQuickMessage(msg, ms); }
function listenPort() { return int(Number(setting('port')) || DEFAULT_PORT, 'port', 1024, 65535); }
function onServerError(s, e) {
  console.error('[' + TITLE + ']', e);
  notify(TITLE + ': ' + e.message, 4000);
  if (state.server === s) state.server = null;
}
function startServer() {
  if (state.server) return;
  conf();
  state.token = loadToken();
  const net = require('net', { message: TITLE + ' listens on 127.0.0.1 only, for the local MCP server. It makes no outgoing connections.' });
  if (!net) bad('Network permission was denied, so the bridge cannot listen.');
  const port = listenPort();
  const s = net.createServer(onConnection);
  s.on('error', (e) => onServerError(s, e));
  s.listen(port, '127.0.0.1', () => notify(TITLE + ' listening on 127.0.0.1:' + port, 2500));
  state.server = s;
}
function stopServer() {
  if (!state.server) return;
  state.server.close();
  state.server = null;
  notify(TITLE + ' stopped', 1500);
}
function safeStart() {
  try { startServer(); } catch (e) {
    console.error('[' + TITLE + ']', e);
    Blockbench.showMessageBox({ title: TITLE, message: String(e.message || e) });
  }
}

function settingDefs() {
  return {
    port: { name: TITLE + ': port', description: 'Port on 127.0.0.1. Stop and start the bridge after changing it.', type: 'number', value: DEFAULT_PORT, min: 1024, max: 65535 },
    output_folder: { name: TITLE + ': output folder', description: 'Absolute path. Screenshots and exports go here; reading and writing allowed. Path prefix "output:". "output_folder" in the settings file wins over this.', type: 'text', value: defaultOutput() },
    assets_folder: { name: TITLE + ': assets folder (optional)', description: 'Absolute path, for example a resource pack or a mod\'s assets/<modid> folder. Reading and writing allowed. Path prefix "assets:". Empty means off. "assets_folder" in the settings file wins over this.', type: 'text', value: '' },
    autostart: { name: TITLE + ': start automatically', description: 'Start listening when Blockbench opens.', type: 'toggle', value: true },
  };
}
function onload() {
  const defs = settingDefs();
  Object.keys(defs).forEach((key) => state.deletables.push(new Setting(ID + '_' + key, Object.assign({ category: 'general' }, defs[key]))));
  const action = new Action(ID + '_toggle', {
    name: TITLE + ': start / stop', icon: 'lan', category: 'tools',
    click() { if (state.server) stopServer(); else safeStart(); },
  });
  MenuBar.addAction(action, 'tools');
  state.deletables.push(action);
  if (setting('autostart') !== false) safeStart();
}
function onunload() {
  stopServer();
  state.deletables.forEach((d) => { try { d.delete(); } catch (e) { console.warn('[' + TITLE + ']', e); } });
  state.deletables = [];
}

Plugin.register(ID, {
  title: TITLE,
  author: 'Stonecut Studio',
  icon: 'lan',
  description: 'Local, token-protected bridge so an MCP server can build GeckoLib and Java models, textures and animations in Blockbench.',
  version: VERSION,
  min_version: '4.8.0',
  variant: 'desktop',
  onload,
  onunload,
});
})();

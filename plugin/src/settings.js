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

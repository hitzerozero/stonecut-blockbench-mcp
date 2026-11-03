const PREFIX = /^(output|assets):(.*)$/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

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
  if (PathM.relative(root, full).split(/[\\/]/).some((seg) => WINDOWS_DEVICE.test(seg))) bad('Path may not use a Windows device name (CON, PRN, AUX, NUL, COM1, LPT1...): ' + full);
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

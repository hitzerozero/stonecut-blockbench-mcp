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

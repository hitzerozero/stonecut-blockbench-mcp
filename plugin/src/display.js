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

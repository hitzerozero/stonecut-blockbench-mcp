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

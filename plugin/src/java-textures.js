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

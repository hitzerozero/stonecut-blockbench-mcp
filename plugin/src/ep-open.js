function geoSummary() { return { format: Format.id, name: Project.name, bones: Group.all.length, cubes: Cube.all.length }; }
const GEO_IDENTIFIER = /^geometry\.[A-Za-z0-9_.\-]+$/;
function checkGeoJson(json, full) {
  if (json && (json.elements || json.parent) && !json['minecraft:geometry']) bad('This is a Java block/item model. Use open_java_model for it: ' + full);
  if (!json || !Array.isArray(json['minecraft:geometry'])) bad('Not a .geo.json model: ' + full);
  json['minecraft:geometry'].forEach((g, i) => {
    const id = g && g.description && g.description.identifier;
    if (typeof id !== 'string' || !GEO_IDENTIFIER.test(id)) bad(`minecraft:geometry[${i}].description.identifier must look like "geometry.name" (letters, digits, _ . -): ${full}`);
  });
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
// After parsing, Blockbench looks for the entity's texture itself (textures/entity/<identifier> near the
// working folder, the default path, entity/ and attachables/ folders) with no folder fence. Those lookups
// are switched off while the plugin loads a model; textures come only through texture_import.
const TEXTURE_LOOKUPS = [['BedrockEntityManager', 'initEntity'], ['BedrockBlockManager', 'initBlock']];
function withoutTextureLookup(fn) {
  const saved = [];
  TEXTURE_LOOKUPS.forEach(([cls, method]) => {
    const C = globalThis[cls];
    if (typeof C === 'function' && C.prototype && typeof C.prototype[method] === 'function') {
      saved.push([C.prototype, method, C.prototype[method]]);
      C.prototype[method] = function () { return undefined; };
    }
  });
  try { return fn(); } finally { saved.forEach(([proto, method, original]) => { proto[method] = original; }); }
}
function loadGeo(json, full) {
  try {
    withoutTextureLookup(() => Codecs.bedrock.load(json, { path: full, no_file: true }, { switch_to_existing_tab: false }));
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

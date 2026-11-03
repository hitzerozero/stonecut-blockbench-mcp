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

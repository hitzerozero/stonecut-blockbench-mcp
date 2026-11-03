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

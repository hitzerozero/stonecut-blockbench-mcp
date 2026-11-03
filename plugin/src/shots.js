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

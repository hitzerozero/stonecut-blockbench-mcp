function mainTexture() { return Texture.getDefault() || Texture.all[0] || bad('No texture yet. Call texture_create first.'); }
function imageReady(tex) {
  return new Promise((res) => {
    const img = tex.img;
    if (!img || (img.complete && img.naturalWidth)) return setTimeout(res, 0);
    img.addEventListener('load', () => setTimeout(res, 0), { once: true });
    img.addEventListener('error', () => res(), { once: true });
    setTimeout(res, 3000);
  });
}
function newTexture(dataUrl, texName) {
  const tex = new Texture({ name: texName || ((Project.name || 'texture') + '.png') }).fromDataURL(dataUrl).add(false);
  if (isJava()) { tex.namespace = Project.stonecut_namespace || DEFAULT_NAMESPACE; tex.folder = 'item'; }
  return tex;
}
async function setTextureImage(dataUrl, texName) {
  const tex = Texture.all[0] ? Texture.all[0].fromDataURL(dataUrl) : newTexture(dataUrl, texName);
  await imageReady(tex);
  Cube.all.forEach((c) => c.applyTexture(tex, true));
  Canvas.updateAll();
  return tex;
}
function paint(editName, fn) {
  needProject();
  const tex = mainTexture();
  tex.edit((canvas) => {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    fn(ctx, canvas);
  }, { edit_name: TITLE + ': ' + editName });
  Canvas.updateAll();
  return { texture: tex.name, size: [tex.width, tex.height] };
}
function fillPx(ctx, x, y, w, h, c) {
  if (c === null) return ctx.clearRect(x, y, w, h);
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
function isPng(bytes) { return bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47; }
function readPngBytes(target) {
  checkFileSize(target.fs.statSync(target.full).size, target.full);
  const bytes = target.fs.readFileSync(target.full);
  if (!isPng(bytes) || bytes.length < 24) bad('Not a PNG file: ' + target.full);
  checkTextureSide(bytes.readUInt32BE(16), 'PNG width');
  checkTextureSide(bytes.readUInt32BE(20), 'PNG height');
  return bytes;
}
function pngBase64(url) { return url.replace(/^data:image\/png;base64,/, ''); }
async function importTexture(p, uvFromImage) {
  const src = checkPath(p, ['.png']);
  const url = 'data:image/png;base64,' + readPngBytes(src).toString('base64');
  const tex = await setTextureImage(url, PathM.basename(src.full));
  const size = [tex.img.naturalWidth, tex.img.naturalHeight];
  if (uvFromImage) { Project.texture_width = size[0]; Project.texture_height = size[1]; }
  return { path: src.full, size, uv_size: [Project.texture_width, Project.texture_height] };
}
function blankCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

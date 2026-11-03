function rectArgs(p) { return [p.x, p.y, p.w, p.h].map((v, i) => int(v, ['x', 'y', 'w', 'h'][i], 0, 4096)); }
function pixelArgs(pixels) {
  if (!Array.isArray(pixels) || !pixels.length || pixels.length > 65536) bad('pixels must be a list of [x, y, colour] (max 65536)');
  return pixels.map((q, i) => {
    if (!Array.isArray(q) || q.length !== 3) bad(`pixels[${i}] must be [x, y, colour]`);
    return [int(q[0], 'x', 0, 4095), int(q[1], 'y', 0, 4095), color(q[2])];
  });
}
function paletteArg(palette) {
  plainObject(palette, 'palette');
  const pal = {};
  Object.keys(palette).forEach((k) => {
    if (k.length !== 1) bad('palette keys must be single characters');
    pal[k] = color(palette[k]);
  });
  return pal;
}
function checkDrawWork(rows, scale) {
  const cells = rows.reduce((n, r) => n + r.length, 0);
  if (cells > LIMITS.drawCells) bad(`${cells} characters in rows; the limit is ${LIMITS.drawCells}`);
  if (cells * scale * scale > LIMITS.drawPixels) bad(`rows times scale would paint ${cells * scale * scale} pixels; the limit is ${LIMITS.drawPixels}`);
}
function drawRows(ctx, rows, pal, at) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (Object.prototype.hasOwnProperty.call(pal, ch)) fillPx(ctx, at.x + x * at.scale, at.y + y * at.scale, at.scale, at.scale, pal[ch]);
  }));
}
function textureCanvas(p, w, h) {
  const c = blankCanvas(w, h);
  const ctx = c.getContext('2d');
  if (p.fill !== undefined && color(p.fill)) { ctx.fillStyle = p.fill; ctx.fillRect(0, 0, w, h); }
  const old = Texture.all[0];
  const kept = !!(old && p.keep_pixels !== false);
  if (kept) ctx.drawImage(old.canvas, 0, 0);
  return { c, kept };
}

endpoints.texture_create = async (p) => {
  needProject();
  const w = checkTextureSide(intOr(p.width, Project.texture_width, 'width', 1, 4096), 'width');
  const h = checkTextureSide(intOr(p.height, w, 'height', 1, 4096), 'height');
  const texName = p.name === undefined ? undefined : name(p.name, 'name');
  const { c, kept } = textureCanvas(p, w, h);
  await setTextureImage(c.toDataURL('image/png'), texName);
  if (p.set_uv_size !== false) { Project.texture_width = w; Project.texture_height = h; }
  Canvas.updateAll();
  return { size: [w, h], kept_old_pixels: kept, texture_uv_size: [Project.texture_width, Project.texture_height] };
};

endpoints.texture_fill_rect = (p) => {
  const c = color(p.color);
  const r = rectArgs(p);
  return paint('fill rect', (ctx) => fillPx(ctx, r[0], r[1], r[2], r[3], c));
};

endpoints.texture_set_pixels = (p) => {
  const px = pixelArgs(p.pixels);
  return paint('set pixels', (ctx) => px.forEach((q) => fillPx(ctx, q[0], q[1], 1, 1, q[2])));
};

endpoints.texture_draw = (p) => {
  const at = { x: intOr(p.x, 0, 'x', 0, 4095), y: intOr(p.y, 0, 'y', 0, 4095), scale: intOr(p.scale, 1, 'scale', 1, 64) };
  if (!Array.isArray(p.rows) || !p.rows.every((r) => typeof r === 'string')) bad('rows must be a list of strings');
  checkDrawWork(p.rows, at.scale);
  const pal = paletteArg(p.palette);
  return paint('draw', (ctx) => drawRows(ctx, p.rows, pal, at));
};

endpoints.texture_import = async (p) => { needProject(); return importTexture(p.path, p.set_uv_size === true); };

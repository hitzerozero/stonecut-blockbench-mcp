function cubeCorners(c, at) {
  if (c.from !== undefined || c.to !== undefined) return [vec(c.from, 3, null, at + '.from', LIMITS.coord), vec(c.to, 3, null, at + '.to', LIMITS.coord)];
  if (c.origin === undefined || c.size === undefined) bad(`${at}: give "from"+"to" or "origin"+"size"`);
  const from = vec(c.origin, 3, null, at + '.origin', LIMITS.coord);
  const size = vec(c.size, 3, null, at + '.size', LIMITS.coord);
  return [from, from.map((v, k) => v + size[k])];
}
function cubeBone(c, at) {
  if (c.bone === undefined && isJava()) return null;
  return findBone(c.bone) || bad(`${at}: bone "${c.bone}" not found (GeckoLib cubes must be inside a bone)`);
}
function boxUv() { return Project.box_uv !== undefined ? !!Project.box_uv : !!Format.box_uv; }
function cubeData(c, at, bone, from, to) {
  const center = from.map((v, k) => (v + to[k]) / 2);
  return {
    name: c.name ? name(c.name, at + '.name') : bone ? bone.name : 'cube', from, to,
    origin: vec(c.pivot, 3, bone ? bone.origin : center, at + '.pivot', LIMITS.coord),
    rotation: vec(c.rotation, 3, [0, 0, 0], at + '.rotation', LIMITS.angle),
    inflate: c.inflate === undefined ? 0 : num(c.inflate, at + '.inflate', LIMITS.inflate),
    uv_offset: vec(c.uv_offset, 2, [0, 0], at + '.uv_offset', LIMITS.uv),
    mirror_uv: !!c.mirror,
    box_uv: boxUv(),
  };
}
function cubeSpec(c, i) {
  const at = `cubes[${i}]`;
  plainObject(c, at);
  const bone = cubeBone(c, at);
  const [from, to] = cubeCorners(c, at);
  if (to.some((v, k) => v < from[k])) bad(`${at}: "to" must be >= "from" on every axis`);
  const faces = c.faces === undefined ? null : faceUvs(c.faces, at);
  return { bone, faces, data: cubeData(c, at, bone, from, to) };
}
function makeCube(s) {
  const cube = new Cube(s.data).init();
  cube.addTo(s.bone || 'root');
  if (Texture.all.length) cube.applyTexture(mainTexture(), true);
  if (s.faces) applyFaceUvs(cube, s.faces);
  return cube;
}
function addCubes(list) {
  needProject();
  const specs = nonEmptyList(list, 'cubes').map(cubeSpec);
  checkCubeTotal(Cube.all.length + specs.length);
  Undo.initEdit({ outliner: true, elements: [] });
  const made = specs.map(makeCube);
  Undo.finishEdit(TITLE + ': add cubes', { outliner: true, elements: made });
  Canvas.updateAll();
  return { added: made.length, cube_count: Cube.all.length };
}
function extent(withInflate) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  Cube.all.forEach((c) => [0, 1, 2].forEach((k) => {
    const pad = withInflate ? c.inflate : 0;
    min[k] = Math.min(min[k], c.from[k] - pad);
    max[k] = Math.max(max[k], c.to[k] + pad);
  }));
  return { min, max };
}
endpoints.add_cubes = (p) => addCubes(p.cubes);

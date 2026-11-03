const FACE_DIRS = ['north', 'south', 'east', 'west', 'up', 'down'];

function faceUv(f, label) {
  const uv = vec(Array.isArray(f) ? f : plainObject(f, label).uv, 4, null, label + '.uv', LIMITS.uv);
  const rotation = Array.isArray(f) || f.rotation === undefined ? 0 : f.rotation;
  if (![0, 90, 180, 270].includes(rotation)) bad(label + '.rotation must be 0, 90, 180 or 270');
  return { uv, rotation };
}
function faceUvs(faces, at) {
  plainObject(faces, at + '.faces');
  const out = {};
  Object.keys(faces).forEach((dir) => {
    if (!FACE_DIRS.includes(dir)) bad(`${at}.faces: unknown face "${dir}"`);
    out[dir] = faces[dir] === null ? null : faceUv(faces[dir], `${at}.faces.${dir}`);
  });
  return out;
}
function applyFaceUvs(cube, faces) {
  cube.autouv = 0;
  Object.keys(faces).forEach((dir) => {
    const face = cube.faces[dir];
    if (faces[dir] === null) { face.texture = null; face.uv = [0, 0, 0, 0]; return; }
    face.uv = faces[dir].uv.slice();
    face.rotation = faces[dir].rotation;
  });
}

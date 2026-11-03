function boneSpec(b, i, seen) {
  plainObject(b, `bones[${i}]`);
  const n = name(b.name, `bones[${i}].name`);
  if (seen.has(n)) bad('Bone name already used: ' + n);
  if (b.parent && !seen.has(b.parent)) bad(`bones[${i}]: parent "${b.parent}" not found (create parents first)`);
  seen.add(n);
  return { name: n, parent: b.parent || null, origin: vec(b.pivot, 3, [0, 0, 0], 'pivot', LIMITS.coord), rotation: vec(b.rotation, 3, [0, 0, 0], 'rotation', LIMITS.angle) };
}
function addBones(list) {
  needProject();
  const seen = new Set(Group.all.map((g) => g.name));
  const specs = nonEmptyList(list, 'bones').map((b, i) => boneSpec(b, i, seen));
  Undo.initEdit({ outliner: true });
  specs.forEach((s) => new Group({ name: s.name, origin: s.origin, rotation: s.rotation }).init().addTo(s.parent ? findBone(s.parent) : 'root'));
  Undo.finishEdit(TITLE + ': add bones', { outliner: true });
  Canvas.updateAll();
  return { added: specs.map((s) => s.name) };
}
endpoints.add_bones = (p) => addBones(p.bones);

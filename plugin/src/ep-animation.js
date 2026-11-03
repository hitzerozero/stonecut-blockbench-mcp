const CHANNELS = ['rotation', 'position', 'scale'];
const INTERPOLATIONS = ['linear', 'catmullrom', 'step', 'bezier'];

function loopArg(loop) {
  const v = loop === true || loop === undefined ? 'loop' : loop === false ? 'once' : loop;
  if (!['loop', 'once', 'hold'].includes(v)) bad('loop must be true/false or "loop", "once", "hold"');
  return v;
}
function keyValue(v) { return typeof v === 'number' || typeof v === 'string' ? v : bad('keyframe values must be numbers or Molang strings'); }
function keyframeSpec(k, interp) {
  plainObject(k, 'keyframe');
  const interpolation = k.interpolation || interp;
  if (!INTERPOLATIONS.includes(interpolation)) bad('interpolation must be ' + INTERPOLATIONS.join(', '));
  const v = typeof k.value === 'number' ? [k.value, k.value, k.value] : k.value;
  if (!Array.isArray(v) || v.length !== 3) bad('value must be [x, y, z] (or one number for all three)');
  const time = num(k.time, 'time', LIMITS.seconds);
  if (time < 0) bad('time must be >= 0');
  return { time, interpolation, data_points: [{ x: keyValue(v[0]), y: keyValue(v[1]), z: keyValue(v[2]) }] };
}
function trackSpec(t, i, interp) {
  plainObject(t, `tracks[${i}]`);
  const bone = findBone(t.bone) || bad(`tracks[${i}]: bone "${t.bone}" not found`);
  const channel = t.channel || 'rotation';
  if (!CHANNELS.includes(channel)) bad('channel must be ' + CHANNELS.join(', '));
  const kfs = nonEmptyList(t.keyframes, `tracks[${i}].keyframes`).map((k) => keyframeSpec(k, t.interpolation || interp));
  return { bone, channel, kfs };
}
function addTrack(anim, t, made) {
  const animator = anim.getBoneAnimator(t.bone) || bad('Cannot animate bone ' + t.bone.name);
  t.kfs.forEach((k) => made.push(animator.addKeyframe(Object.assign({ channel: t.channel }, k))));
  return Math.max(...t.kfs.map((k) => k.time));
}

endpoints.add_animation = (p) => {
  needProject();
  if (!Format.animation_mode) bad('This project format has no animations.');
  const n = name(p.name, 'name');
  if (Animator.animations.some((a) => a.name === n)) bad('Animation already exists: ' + n);
  const loop = loopArg(p.loop);
  const length = p.length === undefined ? 1 : num(p.length, 'length', LIMITS.seconds);
  if (length < 0) bad('length must be >= 0');
  Undo.initEdit({ animations: [] });
  const anim = new (animClass())({ name: n, loop, length }).add();
  anim.setLength(length);
  Undo.finishEdit(TITLE + ': add animation', { animations: [anim] });
  return { name: anim.name, loop: anim.loop, length: anim.length };
};

endpoints.add_keyframes = (p) => {
  needProject();
  const anim = findAnim(p.animation);
  const tracks = nonEmptyList(p.tracks, 'tracks');
  const total = tracks.reduce((n, t) => n + (t && Array.isArray(t.keyframes) ? t.keyframes.length : 0), 0);
  if (total > LIMITS.keyframes) bad(`${total} keyframes in one call; the limit is ${LIMITS.keyframes}`);
  const plan = tracks.map((t, i) => trackSpec(t, i, p.interpolation || 'linear'));
  Undo.initEdit({ keyframes: [] });
  const made = [];
  const maxTime = Math.max(...plan.map((t) => addTrack(anim, t, made)));
  if (maxTime > anim.length) anim.setLength(maxTime);
  Undo.finishEdit(TITLE + ': add keyframes', { keyframes: made });
  if (modeId() === 'animate') Animator.preview();
  return { added: made.length, animation: anim.name, length: anim.length };
};

// Limits on the work one request can ask for.
const LIMITS = { number: 1e6, coord: 4096, angle: 360, inflate: 16, uv: 8192, seconds: 3600, keyframes: 4096, drawCells: 262144, drawPixels: 16777216, bones: 4096 };
function num(v, label, max) {
  const m = max === undefined ? LIMITS.number : max;
  if (typeof v !== 'number' || !isFinite(v)) bad((label || 'value') + ' must be a number');
  if (Math.abs(v) > m) bad(`${label || 'value'} must stay within -${m}..${m}`);
  return v;
}
function int(v, label, min, max) {
  if (!Number.isInteger(v) || v < min || v > max) bad(`${label} must be an integer from ${min} to ${max}`);
  return v;
}
function intOr(v, def, label, min, max) { return int(v === undefined ? def : v, label, min, max); }
function vec(v, n, def, label, max) {
  if (v === undefined || v === null) return def ? def.slice() : bad(`${label} is required`);
  if (!Array.isArray(v) || v.length !== n) bad(`${label} must be an array of ${n} numbers`);
  return v.map((x) => num(x, label, max));
}
function name(v, label) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.\-]{1,64}$/.test(v)) bad(`${label} must be 1-64 chars of A-Z a-z 0-9 _ . -`);
  return v;
}
function namespace(v, label) {
  if (typeof v !== 'string' || !/^[a-z0-9_.\-]{1,64}$/.test(v)) bad(`${label} must be 1-64 chars of a-z 0-9 _ . -`);
  return v;
}
function color(c) {
  if (c === null || c === 'clear') return null;
  if (typeof c !== 'string' || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c)) bad('colour must be "#rrggbb", "#rrggbbaa", "clear" or null: ' + c);
  return c;
}
function plainObject(v, label) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) bad(label + ' must be an object');
  return v;
}
function nonEmptyList(v, label) {
  if (!Array.isArray(v) || !v.length) bad(label + ' must be a non-empty array');
  return v;
}

function leaveDisplay(prevMode, prevSlot) {
  if (prevMode === 'display') DisplayMode.load(prevSlot);
  else if (Modes.options[prevMode]) Modes.options[prevMode].select();
}
async function shootSlot(slot, w, h, p) {
  const crop = p.crop === undefined ? !slot.startsWith('firstperson') : !!p.crop;
  const url = await displayShot(slot, w, h, crop);
  const file = writePng(url, p.path, `${Project.name || 'model'}_${slot}_${Date.now()}.png`, p.overwrite);
  return Object.assign({ slot, crop, display: slotJson(slot) }, file);
}

endpoints.display_get = (p) => {
  needDisplay();
  if (p.slot !== undefined) checkSlot(p.slot);
  const all = displayMap();
  return { display: p.slot ? { [p.slot]: all[p.slot] || null } : all };
};

endpoints.display_set = (p) => setDisplay(displayArg(p), p.replace === true);

endpoints.display_screenshot = async (p) => {
  needDisplay();
  const slots = (Array.isArray(p.slots) && p.slots.length ? p.slots : [p.slot || 'firstperson_righthand']).map(checkSlot);
  if (p.path && slots.length > 1) bad('path can only be used with a single slot');
  const w = intOr(p.width, 768, 'width', 64, 2048), h = intOr(p.height, 432, 'height', 64, 2048);
  const prevMode = modeId(), prevSlot = DisplayMode.display_slot;
  try {
    if (!Modes.display) Modes.options.display.select();
    const files = [];
    for (const slot of slots) files.push(await shootSlot(slot, w, h, p));
    return { files, size: [w, h] };
  } finally { leaveDisplay(prevMode, prevSlot); }
};

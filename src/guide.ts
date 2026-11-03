export const GUIDE = `Stonecut Blockbench MCP drives the Blockbench desktop app through the Stonecut Bridge plugin.

Files: paths are absolute, or start with "output:" (the output folder) or "assets:" (the optional assets folder). Nothing outside those two folders can be read or written. Call status to see them.

Settings: the person controls a settings file (status shows it): whether export is allowed, size limits for textures, files and cube count, and when Blockbench asks them to confirm (by default before replacing a file or closing a tab). If a call is refused because of it, tell the person which setting refused it and stop; do not try to get around it.

GeckoLib mob:
1. status, then new_project (64x64 texture for small mobs, 128 for large) or open_model.
2. Bones first: one root bone, then body, head, legs... with pivots at the joints. 16 units = 1 block; the model stands on y=0 and faces north (-Z).
3. Cubes next with add_cubes: block out big shapes, screenshot (views front, right, iso), fix proportions, then add detail. Give each cube its own uv_offset.
4. Texture: texture_create, texture_fill_rect per UV island, then texture_draw / texture_set_pixels for eyes, shading and edges.
5. Animate: add_animation, add_keyframes. Screenshot at a few times.
6. export geo, animation and texture when it looks right.

Java item (for example a sword):
1. new_java_item (optionally with display transforms or a preset), add_cubes without bones, texture_create, texture_draw.
2. display_screenshot with slots firstperson_righthand, thirdperson_righthand, gui. Tune with display_set and shoot again.
3. export model and texture.

Leave tabs open for the user; never close a tab with edits.`;

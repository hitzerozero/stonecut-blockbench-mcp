---
name: blockbench
description: Build Minecraft models in Blockbench with the Stonecut Blockbench MCP tools. GeckoLib mobs (bones, cubes, textures, animations) and Java item or block models (elements, textures, display transforms). Use when the person asks to make, change, texture, animate, check or export a model in Blockbench.
---

# Building models in Blockbench

You drive the Blockbench desktop app through the Stonecut Blockbench MCP tools. The person sees every
change live in Blockbench, and you see your work through screenshots that come back as images.

## Before you start

1. Call `status`. It tells you whether the GeckoLib plugin is installed, which folders you may use,
   the person's settings, what is open, and every open tab.
2. If GeckoLib is missing and the person wants a mob, tell them: File > Plugins > Available, install
   "GeckoLib Models & Animations". Without it new mobs are plain Bedrock entity models.
3. Read the settings in the `status` reply. They are the person's choices; work inside them.

## Units and directions

- 16 units = 1 block. A model stands on y = 0 and faces north (-Z).
- "right" in a screenshot view is the model's own right side when it faces north.
- Paths are `output:<relative path>`, `assets:<relative path>`, or an absolute path inside one of those
  two folders. Only `.json` and `.png`.

## A GeckoLib mob

1. `new_project`. Texture 64 x 64 for small and medium mobs, 128 x 128 for large or detailed ones.
2. Bones first with `add_bones`, parents before children:
   - one `root` bone at [0, 0, 0], then `body`, `head`, `left_arm`, `right_arm`, `left_leg`, `right_leg`,
     `tail` and so on, as the creature needs;
   - put each pivot exactly where that part bends: the neck for the head, the shoulder for an arm, the
     hip for a leg. Animation rotates around the pivot, so a wrong pivot shows up as a bad walk.
3. Block out with `add_cubes`: a few big cubes for the main masses only. Then `screenshot` with views
   front, right and iso, compare proportions with what the person asked for, fix, and only then add
   detail (snout, ears, claws, horns).
4. Give every cube its own `uv_offset`. With box UV a cube of size w, h, d takes a
   2 x (w + d) by (d + h) area of the texture. Lay islands out left to right, top to bottom, without overlap.
   Mirrored limbs can share an island with `mirror: true`.
5. Paint:
   - `texture_create`, then `texture_fill_rect` with a base colour per UV island;
   - shade: lighter on top faces, darker underneath and on the back, a darker edge line where parts meet;
   - details with `texture_draw` (a character grid with a palette) or `texture_set_pixels`: eyes, mouth,
     spots, scales. Keep to a small palette of 4 to 8 colours per material.
6. Animate with `add_animation` and `add_keyframes`:
   - idle: slow and small, 2 to 4 seconds, a 1 to 3 degree breath on the body, a slight head turn;
   - walk: about 1 second, legs swing opposite each other (around 25 to 35 degrees), arms against legs;
   - attack: wind up, strike fast, recover; usually "once" rather than "loop";
   - a looping animation ends on the pose it starts with.
   Screenshot at a few times (`animation` and `time`) to check the poses.
7. Look at every side (front, back, left, right, top, iso) before you call it done.
8. `export` geo, animation and texture when the person is happy, into the folder they want.

## A Java item (for example a sword)

1. `new_java_item`, optionally with display transforms or a `preset` file that has a `display` block.
   Texture 16 x 16 for a plain item, 32 x 32 or 64 x 64 for more detail.
2. `add_cubes` without bones. Java models have limits:
   - element corners stay within -16 and 32 on every axis;
   - an element rotates on one axis only, by -45, -22.5, 0, 22.5 or 45 degrees;
   - give per-face UVs with `faces` when the default box mapping does not fit.
3. `texture_create`, then paint as for a mob.
4. `display_screenshot` with slots `firstperson_righthand`, `thirdperson_righthand` and `gui`. Tune with
   `display_set` (translation within -80..80, scale within -4..4) and shoot again. Check `ground`,
   `fixed` and `head` if the item will be seen there.
5. `export` model and texture.

## Quality bar

The steps above make a simple mob. When the person wants a boss, a hero character or anything that
should look finished, hold the work to these rules. Expect several rounds of back and forth.

### Silhouette

- The shape must read at once from far away. Judge it on the iso and front screenshots before any
  painting: if it only reads once it is textured, the shape is not strong enough yet.
- Build strong shapes from layered parts: armour plates, cloth, horns, crowns, glowing cores, spikes.
- Use asymmetry where it helps (one bigger pauldron, a broken horn, a cape over one shoulder).
- Avoid the blocky "box man": a box head on a box body on four box limbs.

### Bodies

- Limbs in 2 to 3 tapered segments (upper arm, forearm, hand), each narrower than the one above.
- Muscle groups as layered or slightly rotated cubes, not one block per body part.
- Bevel hard edges with inset cubes: a slightly smaller cube on top of a bigger one.
- Separate bones for fingers or claws when they should move, and an item or hand bone where the
  creature holds something.
- Pivots at the real joints: shoulder, elbow, wrist, hip, knee, ankle, neck, jaw, tail base.
- Clean, consistent bone names: `left_upper_arm`, `left_forearm`, `left_hand`, the same pattern on both
  sides.

### Texture

- Hand-painted pixel art at a resolution that fits the size: 64 x 64 for small creatures, 128 x 128 to
  256 x 256 for big or detailed ones.
- For each material (skin, metal, cloth, bone) a ramp of 4 to 6 tones from dark to light.
- Light from above: lighter tops, darker undersides. Ambient occlusion (darker pixels) in creases and
  where parts meet, edge highlights on raised edges and plate rims.
- Emissive parts (eyes, runes, cores) go on a separate glow texture when the target mod supports one.
  The tools work on one texture, so paint the glow parts in their brightest tones and tell the person
  the glow texture can be added by hand in Blockbench.
- No flat fills left in the final texture, no noise-only textures, no placeholder colours.

### Scale

- Big creatures must feel big. A player is about 32 units tall and 16 wide at the shoulders. Compare
  the model's cube coordinates against that, and tell the person how many player heights tall it is.

### Animations

For bosses and important mobs, offer a fuller set: idle, walk, 2 to 3 attacks, one or more signature
moves, hurt, stagger and death, plus an entrance and an ambient move if the person wants them.

- Every attack uses the whole body:
  - anticipation: a wind-up, a shift of weight, a twist of the body away from the target;
  - a fast, committed strike;
  - follow-through and overshoot past the end pose;
  - a recovery back to the stance.
- Overlapping motion: hips, spine, shoulders, head, cloth, chains and tails all move, each a little
  after the part that drives it.
- Smooth easing (`catmullrom` or `bezier` interpolation) instead of linear snaps.
- Wind-ups long and clear enough that a player could see them coming and react.
- Looping animations end on the pose they start with.

### Review loop

After each stage (block-out, detail, texture, each animation):

1. Screenshot views front, back, left, right, top and iso. For animations, screenshot frames at the
   wind-up, the hit and the recovery times.
2. Check against this list and write down what fails:
   - silhouette reads at a glance;
   - proportions and scale against a player;
   - pivots sit at the joints (bend a bone in a test pose if unsure);
   - no overlapping UV islands;
   - every material has a full shading ramp;
   - animations have weight: anticipation, commitment, follow-through.
3. Fix what failed and shoot again.
4. Show the person the screenshots and the list, take their notes, and do another round.

### Style study

If the person names a style or shows pictures, first study the proportions (head to body, limb
length, how big hands and feet are) and the shading (how many tones, how strong the outlines, how
saturated). Describe what you see back to them before you build. Never copy anyone else's model files
or textures; build new work in that style.

## Working with the person

- Show screenshots at each stage (block-out, painted, animated) and ask before big changes.
- Name bones, cubes, animations and files plainly (`left_leg`, `walk`, `wolf.geo.json`).
- Leave tabs open for the person. `open_model` and `open_java_model` switch to a tab that is already open.

## Safety rules

- Read and write only inside the output and assets folders. Never try other paths.
- Never replace an existing file unless the person asked for it; only then pass `"overwrite": true`.
- Never close a tab that has edits. `close_tab` only closes unedited duplicates.
- The person's settings decide what is allowed. When Blockbench asks them to confirm and they say no,
  or a setting refuses a call (export turned off, a size limit), stop, tell them which setting refused
  it, and let them decide. Do not look for a way around it.
- There is no tool that runs code in Blockbench, and you do not need one.
- Do not put personal details (names, paths, accounts) into model names, files or textures unless the
  person asks for them.

## Anything new

When the person asks for something this guide does not cover (a block, armor, a vehicle, a different
kind of creature, an unusual animation, another mod's file layout), do not guess and do not refuse.
Work out what it needs:

- which format (GeckoLib entity or Java block/item model);
- the texture size, the bones and their pivots, or the elements and display slots;
- the animations, if any;
- which files to write and where in the output or assets folder they belong.

Check which of that the tools can do. Then offer the person a short plan, a few lines, and build it once
they agree. If part of it cannot be done with the tools, say which part and how they can do it by hand in
Blockbench.

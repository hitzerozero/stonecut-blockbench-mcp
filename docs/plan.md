# Stonecut Blockbench MCP: plan

## Pieces

1. Blockbench plugin (`stonecut_bridge.js`). One file the user loads into Blockbench desktop.
   It listens on `127.0.0.1` only and edits the open Blockbench project when asked.
   Its source lives in `plugin/src/` as small parts; `npm run build` joins them into
   `dist/stonecut_bridge.js` and `plugin/stonecut_bridge.js` (plain, readable, not minified). The copy in
   `plugin/` is kept in git for Blockbench's "Load Plugin from URL"; a test keeps it in step.
2. MCP server (`stonecut-blockbench-mcp`). Node 20+, TypeScript, talks MCP over stdio to the
   AI client and plain HTTP to the plugin. It checks every tool input with zod before anything is
   sent, checks the settings file, and checks every plugin reply with zod before anything is returned.

## Bridge protocol

- Address: `http://127.0.0.1:<port>/<endpoint>`. Default port `38790`. Plugin setting
  "Stonecut Bridge: port"; server env `STONECUT_BB_PORT`.
- Token: 32 random bytes as 64 hex characters, written by the plugin every time the bridge starts to
  `<home>/.stonecut_blockbench_token` (home from `os.homedir()` / Blockbench's
  `SystemInfo.home_directory`). Server env `STONECUT_BB_TOKEN_FILE` overrides the path.
- Identity check, before every call: the server sends `POST /hello` with `{"nonce": <64 hex>}` and no
  token; the bridge answers `{"proof": HMAC-SHA256(token, "stonecut-bridge-proof:" + nonce)}`. Only when
  the proof is right does the server send the call with the token, so another program on the port
  never sees it.
- Request: `POST /<endpoint>`, `Content-Type: application/json`, header `X-Stonecut-Token`,
  body a JSON object, at most 16 MB.
- Refused as soon as the headers arrive, before any body is read: no or wrong token (401), any
  `Origin` header or a Host other than `127.0.0.1` / `localhost` (403), not POST (405), not JSON
  (415), chunked bodies (411), too large (413), headers over 16 KB (431), unknown endpoint (404).
  Bad JSON is 400. More than 8 open connections get 503; headers must arrive within 10 seconds.
- Limits per call (server schema and plugin): coordinates within -4096..4096, rotations within
  -360..360, inflate within -16..16, other numbers within -1000000..1000000, 4096 keyframes,
  `texture_draw` 262144 characters and 16777216 painted pixels, 4096 bones in an opened model (mesh
  polygons count as cubes).
- Reply: `{"ok": true, "result": {...}}` or `{"ok": false, "error": "..."}` (422 when the
  endpoint itself refuses, when the settings file refuses, or when the person denies a confirm
  question). Requests run one at a time.

## Folders

- Output folder (settings file `output_folder`, else the plugin setting, else `<home>/stonecut-blockbench`):
  read, write, screenshots.
  Path prefix `output:`.
- Assets folder (settings file `assets_folder`, else the plugin setting, empty means off): for example a
  resource pack or a mod's
  `assets/<modid>` folder. Read and write. Path prefix `assets:`.
- Paths are absolute or prefixed, resolved so `..` is removed, and must land inside one of the
  two folders. Only `.json` and `.png`. Nothing is overwritten unless `overwrite: true`.
  The plugin also uses Blockbench's own folder-scoped file access.
- The settings file and the token file can never be read or written by a tool, even when a folder
  contains them; they are compared by real path, ignoring case.
- Symbolic links and junctions below an allowed folder are not followed.
- Java model texture values must be resource locations; file paths and data URLs are refused, and the
  texture loader always answers with a PNG from the allowed folders or a blank one, never nothing (which
  would let Blockbench read the path itself).

## Settings file

`<home>/.stonecut_blockbench_config.json`, owned by the person, read by both sides on every request.
Keys: `output_folder`, `assets_folder`, `allow_export`, `max_texture_size`, `max_file_mb`, `max_cubes`,
`confirm` (`never`, `overwrite_and_close`, `every_change`). Defaults in `config.example.json`; the
README documents each. Unknown keys, bad values and broken JSON make both sides refuse every request.
Keys that would change the listen address (`host`, `bind`, `address`, `listen`, `interface`) are
refused: the bridge always listens on 127.0.0.1.

- The server refuses, before sending: `export` when `allow_export` is false, texture sizes over
  `max_texture_size`, more cubes in one call than `max_cubes`.
- The plugin refuses all of that again, plus files over `max_file_mb` (read or written), PNGs wider or
  taller than `max_texture_size`, and a project total over `max_cubes`.
- Confirm questions are Blockbench message boxes. No answer in two minutes counts as no.

## Tools (MCP) and endpoints (plugin)

Each MCP tool calls the plugin endpoint of the same name.

| Tool | What it does |
|---|---|
| `ping` | Bridge alive, token right, plugin version. |
| `status` | GeckoLib plugin present, folders, open project summary, every open tab. |
| `new_project` | New GeckoLib entity project (Bedrock entity if GeckoLib is missing). |
| `open_model` | Open a `.geo.json` (plus animation and texture) in a tab; switch to or reload it if open. |
| `add_bones` | Add bones with pivots and rotations, parents first. All or nothing. |
| `add_cubes` | Add cubes (from/to or origin/size), box UV offsets, per-face UVs for Java models. |
| `texture_create` | Create or resize the texture, optional fill colour. |
| `texture_fill_rect` | Fill a rectangle. |
| `texture_set_pixels` | Set single pixels. |
| `texture_draw` | Draw a character grid with a palette. |
| `texture_import` | Load a PNG from the allowed folders. |
| `add_animation` | Add an animation (loop, once, hold). |
| `add_keyframes` | Add keyframe tracks (rotation, position, scale) to bones. |
| `screenshot` | Render named views or yaw/pitch, optionally mid-animation. Returns the images. |
| `export` | Write `.geo.json`, `.animation.json`, Java model `.json`, texture `.png`. |
| `open_java_model` | Open a Java block/item model `.json` with elements. |
| `new_java_item` | New Java block/item project, optional display transforms or preset. |
| `display_get` | Read display transforms. |
| `display_set` | Set display transforms (Minecraft limits enforced). |
| `display_screenshot` | Render display slots (first person, third person, gui...). Returns the images. |
| `close_tab` | Close unedited duplicate tabs. |

Left out on purpose: any tool that runs arbitrary code, and single-item `add_bone` / `add_cube`
(the batch tools take a list of one).

Every tool declares `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` (always
false); `test/annotations.test.ts` holds the expected values.

## Tests

- Unit tests (vitest): the MCP server against a fake bridge (local HTTP server in the test),
  the HTTP client, config, and the plugin's pure parts (validation, folder fence, HTTP layer)
  run in a Node sandbox with stand-ins for Blockbench.
- `npm run selftest`: end to end, run by the owner once with Blockbench open and the plugin
  loaded. Uses the real MCP server over stdio.
- `npm run scan` (also a unit test): no personal paths, emails, ports, or names from the local
  git-ignored `.scan-names.local` / `STONECUT_SCAN_NAMES`, in any
  tracked file.
- `install`, `uninstall` and `doctor` are tested with a fake `claude` command and a fake bridge, so the
  tests never run Claude Code or touch Blockbench.
- CI (`.github/workflows/test.yml`): typecheck, unit tests and the scan on Windows, macOS and Linux.

## Releasing

1. `npm run build` and commit, so `plugin/stonecut_bridge.js` and its `.sha256` match the source.
2. Tag `v<version>` (the same as `package.json` and `src/version.ts`) and create the GitHub release.
3. Attach `plugin/stonecut_bridge.js` to the release and paste the SHA-256 from
   `plugin/stonecut_bridge.js.sha256` into the release notes. The README, the setup prompt and
   `install` point at `releases/download/v<version>/stonecut_bridge.js`.
4. `npm publish`, so `stonecut-blockbench-mcp@<version>` exists for the pinned `npx` commands.

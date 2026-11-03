# Stonecut Blockbench MCP

Website: https://stonecut.studio/resources

Stonecut Blockbench MCP is an MCP server and Blockbench plugin that lets AI agents like Claude Code
build Minecraft models in the [Blockbench](https://www.blockbench.net/) desktop app. It makes GeckoLib
mobs with bones, textures and animations, and Java item and block models with display transforms,
while you watch every change and the agent checks its own work through screenshots. Free and open
source under the MIT license.

It has two parts:

- Stonecut Bridge, a Blockbench plugin (one readable file, `stonecut_bridge.js`).
- stonecut-blockbench-mcp, an MCP server that your AI client starts.

## The problem it solves

An AI agent cannot use Blockbench on its own, and writing model files by hand goes wrong in ways it
cannot see: pivots in the wrong place, overlapping UVs, an item held at a strange angle. This tool gives
the agent real Blockbench actions (add bones, add cubes, paint, animate, set display transforms, export)
and shows it the result as images, so it can look, fix and try again like a person would. You keep
control: it only touches the folders you allow, every edit can be undone in Blockbench, and a settings
file decides what it may do.

## Setup

1. Copy the prompt in [docs/setup-with-ai.md](docs/setup-with-ai.md) and paste it into your AI agent (Claude Code, or another agent that supports MCP servers). It checks that you have Node.js and Blockbench, shows its plan, and asks before it installs anything.
2. When it tells you to, load the plugin in Blockbench: File > Plugins, click "Load Plugin from URL" and paste `https://github.com/hitzerozero/stonecut-blockbench-mcp/releases/download/v1.0.0/stonecut_bridge.js`, or download that file and use "Load Plugin from File" (see "Checking the plugin file" below). Click Allow on each permission question. You see "Stonecut Bridge listening on 127.0.0.1:38790".
3. Ask it to build something, for example "Make a small cube creature with an idle animation in Blockbench and show me screenshots." A new tab opens in Blockbench and screenshots appear in the chat.

To set up without an agent, see "Manual setup" below. If something does not work, run
`npx -y stonecut-blockbench-mcp@1.0.0 doctor` (see Troubleshooting).

Blockbench's official plugin list does not accept plugins that let an AI drive Blockbench, so Stonecut
Bridge is shared from this GitHub repository instead of File > Plugins > Available.

## Example requests

Copy one into Claude Code and change the details. Expect a few rounds of screenshots and notes.

- Make a small slime mob with a 64 x 64 texture, an idle bounce and a hop animation. Show me screenshots from the front, side and iso.
- Make a boss golem about three players tall, held to the quality bar in the Blockbench skill: layered stone plates, a glowing core, 128 x 128 texture, and idle, walk, two attacks, hurt and death animations. Show me the block-out before you paint.
- Make a Java item model of a curved sword with a 32 x 32 texture. Set display transforms so it looks right in first person, third person and the inventory, and show me each of those.
- Retexture the model that is open in Blockbench as a frozen version: ice blue tones, frost on the top faces, darker cracks. Keep the UV layout.
- Add a heavy overhead slam attack to the open mob: a slow wind-up, a fast hit, a short shake, then recovery. Show me frames at the wind-up, the hit and the recovery.
- Open output:wolf.geo.json with its animation file and tell me what bones and animations it has.
- Export the open mob as geo, animation and texture into assets:geo, assets:animations and assets:textures/entity.
- Make a crown as a Java item model for the head slot and tune the head display transform.

## What it does

- Opens new GeckoLib or Java item projects, or existing `.geo.json` and Java model `.json` files.
- Adds bones with pivots and rotations, and cubes with box UV or per-face UV.
- Creates and paints the texture: fill rectangles, set pixels, draw small pictures from a character grid, or import a PNG.
- Adds animations and keyframes (rotation, position, scale).
- Renders screenshots from named views or any angle, optionally mid-animation, and returns them to the agent as images.
- Reads and sets Java display transforms (first person, third person, gui, ground and so on) and renders each display slot.
- Exports `.geo.json`, `.animation.json`, Java model `.json` and texture `.png` into the folders you allow.

## How it works

```
AI client (Claude Code) <--stdio--> stonecut-blockbench-mcp <--HTTP on 127.0.0.1--> Stonecut Bridge in Blockbench
```

1. Your AI client starts the MCP server and calls its tools.
2. The MCP server checks every call against a strict schema and against your settings file. Anything
   wrong is refused before it reaches Blockbench.
3. It first makes the plugin prove that it holds the secret token (an answer to a random challenge),
   so another program on the port never sees the token. Then it sends the call with the token.
4. The plugin listens on 127.0.0.1 only. It checks the token, refuses requests from web pages, checks
   the call again, keeps every path inside your output and assets folders, applies your settings, and
   asks you in Blockbench before replacing a file or closing a tab.
5. The plugin makes the change in Blockbench as an undoable edit (Ctrl+Z works) and replies.
6. The MCP server checks the shape of every reply before passing it to the agent. Screenshots come
   back as images.

Requests run one at a time. The plugin makes no outgoing connections.

## Tools

| Tool | What it does | Read-only or changes things |
|---|---|---|
| `ping` | Checks that Blockbench is open, the bridge is listening and the token is right. | read-only |
| `status` | GeckoLib plugin present, allowed folders, settings, open project, every open tab. | read-only |
| `new_project` | Opens a new tab with an empty GeckoLib entity model. | changes, adds only |
| `open_model` | Opens a `.geo.json` with its animation and texture, or switches to it if already open. | changes, adds only |
| `close_tab` | Closes duplicate tabs that have no edits. | changes, can replace |
| `add_bones` | Adds bones with pivots and rotations, parents first. All or nothing. | changes, adds only |
| `add_cubes` | Adds cubes with box UV offsets or per-face UVs. All or nothing. | changes, adds only |
| `texture_create` | Creates or resizes the texture, optionally filled with a colour. | changes, can replace |
| `texture_fill_rect` | Fills a rectangle of the texture with one colour. | changes, can replace |
| `texture_set_pixels` | Sets single pixels. | changes, can replace |
| `texture_draw` | Draws a small picture from rows of characters and a palette. | changes, can replace |
| `texture_import` | Loads a PNG from the allowed folders as the texture. | changes, can replace |
| `add_animation` | Adds an animation (loop, once or hold). | changes, adds only |
| `add_keyframes` | Adds rotation, position and scale keyframes to bones. | changes, adds only |
| `screenshot` | Renders views of the model and returns the images; writes PNGs to the output folder. | changes, can replace |
| `export` | Writes `.geo.json`, `.animation.json`, Java model `.json` and texture `.png`. | changes, can replace |
| `open_java_model` | Opens a Java block or item model `.json`, or switches to it if already open. | changes, adds only |
| `new_java_item` | Opens a new tab with an empty Java item model, optionally with display transforms. | changes, adds only |
| `display_get` | Reads the display transforms of the open Java model. | read-only |
| `display_set` | Sets display transforms within Minecraft's limits. | changes, can replace |
| `display_screenshot` | Renders display slots as Blockbench's display editor shows them and returns the images. | changes, can replace |

"Changes, adds only" tools add to the project and never remove anything. "Changes, can replace" tools
can overwrite pixels, transforms or, when asked with `"overwrite": true`, an existing file. Screenshot
tools write a new PNG on every call and replace a file only when given a path and `"overwrite": true`.
Each tool also reports these as MCP tool annotations (`readOnlyHint`, `destructiveHint`,
`idempotentHint`, `openWorldHint`; the last is false for every tool).

Paths are `output:<relative path>`, `assets:<relative path>`, or an absolute path inside one of those
folders, for example `output:shots/front.png`. Colours are `"#rrggbb"`, `"#rrggbbaa"` or `"clear"`.

## Security settings

The settings file is `.stonecut_blockbench_config.json` in your home folder. You own it; the plugin and
the MCP server only read it. Create it with the defaults:

    npx -y stonecut-blockbench-mcp@1.0.0 --init-config

Show where it is and the settings in use:

    npx -y stonecut-blockbench-mcp@1.0.0 --config

The defaults, also in [config.example.json](config.example.json):

```json
{
  "output_folder": "",
  "assets_folder": "",
  "allow_export": true,
  "max_texture_size": 4096,
  "max_file_mb": 16,
  "max_cubes": 4096,
  "confirm": "overwrite_and_close"
}
```

| Setting | Default | What it does |
|---|---|---|
| `output_folder` | `""`, meaning the Blockbench setting, or else `stonecut-blockbench` in your home folder | Folder for screenshots and exports. Readable and writable. Path prefix `output:`. A full path, or a path starting with `~` for your home folder. |
| `assets_folder` | `""`, meaning the Blockbench setting, or else off | Optional second folder, for example a resource pack or a mod's `assets/<modid>`. Readable and writable. Path prefix `assets:`. |
| `allow_export` | `true` | `false` refuses the `export` tool. Screenshots still go to the output folder, because that is how the agent sees its work, but only to new files with automatic names: no chosen path, nothing replaced. |
| `max_texture_size` | `4096` | Largest texture width or height in pixels, from 16 to 4096. Applies to new projects, `texture_create` and every PNG that is read. |
| `max_file_mb` | `16` | Largest model or texture file, in MB, that may be read or written, from 1 to 256. |
| `max_cubes` | `4096` | Most cubes one project may have, from 1 to 65536. Applies to `add_cubes` and to opening a model. |
| `confirm` | `"overwrite_and_close"` | When Blockbench asks you first. `"overwrite_and_close"`: before replacing an existing file or closing a tab. `"every_change"`: also before every tool that changes the project or writes a file, except screenshots that only add new PNGs. `"never"`: no questions. If nobody answers within two minutes, the answer is no. |

These are the only readable and writable places: the output folder and, if set, the assets folder.
A non-empty folder in the settings file wins over the folder settings in Blockbench.

Fixed, and not changeable:

- The bridge listens on 127.0.0.1 only and cannot be reached from other machines. The settings file
  refuses any `host`, `bind`, `address`, `listen` or `interface` key.
- Every request must carry the secret token from `.stonecut_blockbench_token` in your home folder (32
  random bytes, new every time the bridge starts). Before the server sends it, the bridge must prove it
  holds the token with an HMAC answer to a random challenge.
- Requests from web pages (with an `Origin` header) or for another host name are refused.
- Only `.json` and `.png` files, resolved so `..` cannot leave the folders. Symbolic links and
  junctions inside the folders are not followed. Existing files are kept unless a call says
  `"overwrite": true`.
- Texture references inside a Java model must be resource locations such as `minecraft:item/iron_sword`.
  A model whose textures name a file path or a data URL is refused, and a texture that is not found as a
  PNG inside the allowed folders shows blank.
- One call can only ask for so much work: coordinates within -4096..4096, rotations within -360..360
  degrees, inflate within -16..16, 4096 keyframes, 262144 characters in `texture_draw` (and 16777216
  painted pixels), and 4096 bones in an opened model.
- The plugin and the server are pinned: Claude Code runs `stonecut-blockbench-mcp@1.0.0`, and the plugin
  URL points at the file attached to the v1.0.0 release, so neither changes unless you update it.
- No tool can read or write the settings file or the token file, and no tool runs code.
- A settings file that is not valid makes the plugin and the server refuse every request until it is
  fixed. `--config` shows what is wrong.

Who can use it: any program running as your user account can read the token file, so the bridge trusts
local programs as much as your account does. To report a security problem, see [SECURITY.md](SECURITY.md).

## Limits

- Needs the Blockbench desktop app, open, with the plugin loaded. The web version cannot run it.
- Screenshots use the live preview, so keep the Blockbench window open, not minimised.
- Without the GeckoLib Blockbench plugin, new mobs are plain Bedrock entity models.
- Tools add and change; they do not delete bones or cubes. Undo in Blockbench (Ctrl+Z) or delete by hand.
- Java models: parent models are not followed, and textures outside the allowed folders show blank.
- Files are `.json` and `.png` only. Save the `.bbmodel` yourself in Blockbench if you want one.
- Confirm questions wait for you in Blockbench. While one is open, other requests wait.
- Requests run one at a time; a call waits up to 3 minutes for Blockbench by default.
- Not affiliated with Blockbench, GeckoLib or Mojang.

## Troubleshooting

Run the doctor. It only reads and changes nothing:

    npx -y stonecut-blockbench-mcp@1.0.0 doctor

From a source checkout: `node dist/index.js doctor`. Each line says PASS or FAIL, and every FAIL line
says how to fix it. It checks:

- the Node.js version (20 or newer);
- the settings file: valid, missing (defaults in use) or broken, and which values are in use;
- the token file;
- whether the bridge answers on 127.0.0.1;
- whether the plugin version matches the server version;
- whether the GeckoLib plugin is installed in Blockbench;
- whether the output folder exists and is writable.

Common messages:

- "Bridge not reachable": Blockbench is closed, the plugin is not loaded, the bridge is stopped, or the
  port differs between the plugin setting and `STONECUT_BB_PORT`.
- "No token at ...": the plugin has not started yet, or `STONECUT_BB_TOKEN_FILE` points elsewhere.
- "Settings file ... has a bad value": fix the file; `--config` shows what is wrong.
- "The person did not allow this": you clicked Deny, or nobody answered the confirm question in
  Blockbench within two minutes. See `confirm` under Security settings.

## Remove it completely

1. Run `npx -y stonecut-blockbench-mcp@1.0.0 uninstall`. It lists what it will remove and asks y/n:
   the server in Claude Code, the skill, the token file and the security settings file.
2. In Blockbench: File > Plugins > Installed > Stonecut Bridge > Uninstall.

Your output folder (`stonecut-blockbench` in your home folder, or the one you chose) and your assets
folder are kept on purpose, because they hold your models. Delete them by hand if you want.

## Manual install details

### Manual setup

The same setup without an agent:

1. Install Node.js 20 or newer from https://nodejs.org (the LTS version). Check: `node --version` in a terminal prints v20 or higher.
2. Install Blockbench from https://www.blockbench.net and open it. You see the Blockbench start screen.
3. For mobs, in Blockbench: File > Plugins > Available, install "GeckoLib Models & Animations". It now shows under Installed.
4. In Blockbench: File > Plugins, click "Load Plugin from URL" and paste `https://github.com/hitzerozero/stonecut-blockbench-mcp/releases/download/v1.0.0/stonecut_bridge.js`. Or download that file and use "Load Plugin from File".
5. Blockbench asks to allow network access and access to a few files. Click Allow each time. You see "Stonecut Bridge listening on 127.0.0.1:38790".
6. Install Claude Code if you do not have it (https://claude.com/claude-code), then run `npx -y stonecut-blockbench-mcp@1.0.0 install` in a terminal. It lists what it will do (add the server to Claude Code, copy the skill), asks y/n, and after y prints "Done." `--dry-run` only shows the plan.
7. Run `npx -y stonecut-blockbench-mcp@1.0.0 doctor` with Blockbench open. Every line should say PASS.
8. Start Claude Code and ask it to build something. A new tab opens in Blockbench and screenshots appear in the chat.

### Adding it to Claude Code by hand

`install` runs these for you. To do it yourself:

1. Add the server. macOS and Linux: `claude mcp add --scope user stonecut-blockbench -- npx -y stonecut-blockbench-mcp@1.0.0`. Windows: `claude mcp add --scope user stonecut-blockbench -- cmd /c npx -y stonecut-blockbench-mcp@1.0.0`. Claude Code answers that it added the server.
2. Copy the skill (see "The skill" below).
3. Start Claude Code and type `/mcp`. It lists stonecut-blockbench as connected.

`npx -y stonecut-blockbench-mcp@1.0.0 uninstall` removes the server, the skill, the token file and the settings file again. Both commands show
what they will do and ask y/n first; add `--yes` to skip the question or `--dry-run` to only see the plan. Running `install` twice gives
the same result.

### Checking the plugin file

Each release lists the SHA-256 of `stonecut_bridge.js`; the repository has it in
`plugin/stonecut_bridge.js.sha256`. Before "Load Plugin from File", compare it with the file you
downloaded:

- Windows (PowerShell): `Get-FileHash stonecut_bridge.js -Algorithm SHA256`
- macOS: `shasum -a 256 stonecut_bridge.js`
- Linux: `sha256sum stonecut_bridge.js`

### Where the plugin file is

From npm, `npx -y stonecut-blockbench-mcp@1.0.0 --plugin-path` prints where the package keeps
`stonecut_bridge.js`. Blockbench loads a file plugin from the same path at every start, so copy it
somewhere it will stay before using "Load Plugin from File":

- Windows (PowerShell): `Copy-Item (npx -y stonecut-blockbench-mcp@1.0.0 --plugin-path) $HOME`
- macOS and Linux: `cp "$(npx -y stonecut-blockbench-mcp@1.0.0 --plugin-path)" ~/`

### From source

    git clone https://github.com/hitzerozero/stonecut-blockbench-mcp.git
    cd stonecut-blockbench-mcp
    npm install
    node dist/index.js install

`npm install` also builds `dist/index.js` and `dist/stonecut_bridge.js`. From a source checkout,
`install` points Claude Code at `node <full path to the folder>/dist/index.js` instead of npx.
`node dist/index.js uninstall` and `node dist/index.js doctor` work the same way.

### Other MCP clients

Run `npx -y stonecut-blockbench-mcp@1.0.0` (on Windows `cmd /c npx -y stonecut-blockbench-mcp@1.0.0`) as a stdio
server.

### Plugin settings in Blockbench

File > Preferences > Settings > General, all starting with "Stonecut Bridge":

| Setting | Default | What it does |
|---|---|---|
| port | 38790 | Port on 127.0.0.1. Stop and start the bridge after changing it. |
| output folder | `stonecut-blockbench` in your home folder | Used when the settings file does not set `output_folder`. |
| assets folder | empty (off) | Used when the settings file does not set `assets_folder`. |
| start automatically | on | Listen as soon as Blockbench opens. Tools > Stonecut Bridge: start / stop toggles it. |

If you change the port, give the server the same one:
`claude mcp add --scope user stonecut-blockbench -e STONECUT_BB_PORT=38800 -- npx -y stonecut-blockbench-mcp@1.0.0`.

Environment variables for the server: `STONECUT_BB_PORT` (default 38790), `STONECUT_BB_TOKEN_FILE`
(default `.stonecut_blockbench_token` in your home folder), `STONECUT_BB_TIMEOUT_MS` (default 180000).
`--help` lists them.

Blockbench asks for these permissions, and nothing else: network access to listen on 127.0.0.1, the
token file, the settings file, and on first use your output folder and your assets folder if you set one.

### The skill

`skills/blockbench/SKILL.md` tells an agent how to build mobs and items well and which rules to keep.
For Claude Code, copy the `skills/blockbench` folder to `~/.claude/skills/` (all projects) or to
`.claude/skills/` in one project.

### Check that it works

With Blockbench open and the plugin loaded, from the source folder:

    npm run selftest

It opens new tabs (your open work is left alone), builds a cube mob and a plain sword, takes
screenshots, exports into a new folder under `<output folder>/selftest`, reopens the exports and checks
that bad requests are refused.

### Development

    npm install        # also builds dist/ and plugin/stonecut_bridge.js
    npm test           # unit tests, no Blockbench needed
    npm run typecheck
    npm run build
    npm run scan       # fails on personal paths, emails or ports in tracked files

Names you never want in the repository (your username, private project names) go one per line in
`.scan-names.local` (git ignores it) or in `STONECUT_SCAN_NAMES`; the scan then refuses them too. The
list itself is never stored in the repository.

The plugin source is split into small parts in `plugin/src/`. The build joins them, unminified, into
`dist/stonecut_bridge.js` and `plugin/stonecut_bridge.js`; a test fails if the second is out of date.
[docs/plan.md](docs/plan.md) describes the bridge protocol.

## License

MIT, copyright Stonecut Studio. See [LICENSE](LICENSE). Blockbench and GeckoLib belong to their
authors.

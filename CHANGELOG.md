# Changelog

All notable changes to this project are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## 1.0.0

First public release.

### Building

- MCP server and the Stonecut Bridge plugin for Blockbench, with tools for GeckoLib mobs (bones, cubes,
  textures, animations, screenshots, export) and Java item models (display transforms and display
  screenshots). Every tool states `readOnlyHint`, `destructiveHint`, `idempotentHint` and
  `openWorldHint`.
- `skills/blockbench/SKILL.md`: how to build mobs and items well, a quality bar for finished work, and
  the safety rules.

### Setup

- `docs/setup-with-ai.md`: a setup prompt to paste into an AI agent. It may run only four pinned
  commands, each after a yes.
- `install`, `uninstall` and `doctor` commands. `install` shows its plan and asks first (`--dry-run`
  only shows it, `--yes` skips the question), runs `claude mcp add --scope user` with
  `stonecut-blockbench-mcp@1.0.0`, and copies the skill, backing up a changed copy first. `uninstall`
  removes only files identical to what was installed, and after the same yes also the token file and
  the settings file; it never touches the output or assets folders. `doctor` only reads and says how to
  fix each failure. `--help`, `install` and `doctor` end with a Stonecut Studio line.
- The plugin is loaded from the file attached to the v1.0.0 GitHub release; its SHA-256 is in
  `plugin/stonecut_bridge.js.sha256` and on the release page. Its entry in Blockbench links to the
  website, the repository and the issue tracker.

### Security

- The bridge listens on 127.0.0.1 only, refuses web pages and other host names, and needs a token
  that is new every time it starts. Before sending the token, the server makes the bridge prove it
  holds it (HMAC over a random challenge).
- Security settings file `.stonecut_blockbench_config.json`: output and assets folders, whether
  export is allowed, size limits, and confirm questions in Blockbench. Both sides enforce it and refuse
  everything while it is broken.
- Paths stay inside the output and assets folders; links are not followed; the settings and token files
  are never reachable by a tool. Java model textures must be resource locations, and anything not found
  in the allowed folders shows blank.
- Limits on the work one call can ask for; headers are checked before a body is read; a cap on
  connections.
- `npm run scan` fails on personal paths, emails and ports in tracked files; names you want blocked
  stay in a local, git-ignored file. CI runs typecheck, tests and the scan on Windows, macOS and Linux
  with actions pinned by commit and dependencies pinned to exact versions.

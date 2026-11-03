# Security

## Reporting a problem

Please report security problems privately, not in a public issue.

1. Open the repository on GitHub.
2. Go to the Security tab and click "Report a vulnerability".
3. Describe what you found, how to reproduce it, and which version you used
   (`npx -y stonecut-blockbench-mcp@1.0.0 --version`, or the version in your MCP config, and the plugin
   version shown in Blockbench under File > Plugins).

You will get an answer in the advisory thread. Once a fix is released, the advisory is published and
the fix is listed in [CHANGELOG.md](CHANGELOG.md).

## Supported versions

Only the latest release gets security fixes.

## What counts

Anything that lets something other than the person's own MCP client make the bridge act, or lets a
tool call reach past the limits described in the README, for example:

- reading or writing a file outside the output and assets folders, or the settings or token file;
- reaching the bridge from another machine, from a web page, or without the token;
- getting around a setting in the settings file (export turned off, size limits, confirm questions);
- running code in Blockbench through a tool call.

Out of scope: a program that already runs as the same user account. It can read the token file, so the
bridge trusts it as much as that account does (see "Security settings" in the README).

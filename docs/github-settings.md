# GitHub repository settings

The values to set on the GitHub repository at launch, so it shows up in searches.

## Description

```text
MCP server and Blockbench plugin that let AI agents like Claude Code build Minecraft models: GeckoLib mobs with bones, textures and animations, and Java item models with display transforms. Local only, with a settings file you control.
```

## Website

```text
https://stonecut.studio/resources
```

## Topics

```text
minecraft
blockbench
blockbench-plugin
mcp
mcp-server
model-context-protocol
geckolib
claude
claude-code
ai-agent
minecraft-modding
minecraft-models
pixel-art
animation
ai-tools
3d-modeling
minecraft-java
```

## Commands

```text
gh repo edit hitzerozero/stonecut-blockbench-mcp \
  --description "MCP server and Blockbench plugin that let AI agents like Claude Code build Minecraft models: GeckoLib mobs with bones, textures and animations, and Java item models with display transforms. Local only, with a settings file you control." \
  --homepage "https://stonecut.studio/resources" \
  --add-topic minecraft --add-topic blockbench --add-topic blockbench-plugin --add-topic mcp \
  --add-topic mcp-server --add-topic model-context-protocol --add-topic geckolib --add-topic claude \
  --add-topic claude-code --add-topic ai-agent --add-topic minecraft-modding --add-topic minecraft-models \
  --add-topic pixel-art --add-topic animation --add-topic ai-tools --add-topic 3d-modeling \
  --add-topic minecraft-java
```

## Private vulnerability reporting

SECURITY.md asks people to use the Security tab's "Report a vulnerability" button. Turn it on:

```text
gh api -X PUT repos/hitzerozero/stonecut-blockbench-mcp/private-vulnerability-reporting
```

## Social preview

`docs/social-preview.png` (1280 x 640) has to be uploaded by hand: on GitHub, Settings > General >
Social preview > Edit > Upload an image. There is no command for it.

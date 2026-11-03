function settingDefs() {
  return {
    port: { name: TITLE + ': port', description: 'Port on 127.0.0.1. Stop and start the bridge after changing it.', type: 'number', value: DEFAULT_PORT, min: 1024, max: 65535 },
    output_folder: { name: TITLE + ': output folder', description: 'Absolute path. Screenshots and exports go here; reading and writing allowed. Path prefix "output:". "output_folder" in the settings file wins over this.', type: 'text', value: defaultOutput() },
    assets_folder: { name: TITLE + ': assets folder (optional)', description: 'Absolute path, for example a resource pack or a mod\'s assets/<modid> folder. Reading and writing allowed. Path prefix "assets:". Empty means off. "assets_folder" in the settings file wins over this.', type: 'text', value: '' },
    autostart: { name: TITLE + ': start automatically', description: 'Start listening when Blockbench opens.', type: 'toggle', value: true },
  };
}
function onload() {
  const defs = settingDefs();
  Object.keys(defs).forEach((key) => state.deletables.push(new Setting(ID + '_' + key, Object.assign({ category: 'general' }, defs[key]))));
  const action = new Action(ID + '_toggle', {
    name: TITLE + ': start / stop', icon: 'lan', category: 'tools',
    click() { if (state.server) stopServer(); else safeStart(); },
  });
  MenuBar.addAction(action, 'tools');
  state.deletables.push(action);
  if (setting('autostart') !== false) safeStart();
}
function onunload() {
  stopServer();
  state.deletables.forEach((d) => { try { d.delete(); } catch (e) { console.warn('[' + TITLE + ']', e); } });
  state.deletables = [];
}

Plugin.register(ID, {
  title: TITLE,
  author: 'Stonecut Studio',
  icon: 'lan',
  description: 'Local, token-protected bridge so an MCP server can build GeckoLib and Java models, textures and animations in Blockbench.',
  version: VERSION,
  website: 'https://stonecut.studio/resources',
  repository: 'https://github.com/hitzerozero/stonecut-blockbench-mcp',
  bug_tracker: 'https://github.com/hitzerozero/stonecut-blockbench-mcp/issues',
  min_version: '4.8.0',
  variant: 'desktop',
  onload,
  onunload,
});

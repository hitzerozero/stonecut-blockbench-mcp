function notify(msg, ms) { Blockbench.showQuickMessage(msg, ms); }
function listenPort() { return int(Number(setting('port')) || DEFAULT_PORT, 'port', 1024, 65535); }
function onServerError(s, e) {
  console.error('[' + TITLE + ']', e);
  notify(TITLE + ': ' + e.message, 4000);
  if (state.server === s) state.server = null;
}
function startServer() {
  if (state.server) return;
  conf();
  state.token = loadToken();
  const net = require('net', { message: TITLE + ' listens on 127.0.0.1 only, for the local MCP server. It makes no outgoing connections.' });
  if (!net) bad('Network permission was denied, so the bridge cannot listen.');
  const port = listenPort();
  const s = net.createServer(onConnection);
  s.on('error', (e) => onServerError(s, e));
  s.listen(port, '127.0.0.1', () => notify(TITLE + ' listening on 127.0.0.1:' + port, 2500));
  state.server = s;
}
function stopServer() {
  if (!state.server) return;
  state.server.close();
  state.server = null;
  notify(TITLE + ' stopped', 1500);
}
function safeStart() {
  try { startServer(); } catch (e) {
    console.error('[' + TITLE + ']', e);
    Blockbench.showMessageBox({ title: TITLE, message: String(e.message || e) });
  }
}

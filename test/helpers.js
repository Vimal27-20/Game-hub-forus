const { io: connect } = require('socket.io-client');
const { createApp } = require('../server/app');

// Start a hub on a random port. Returns helpers bound to it.
async function startHub(opts = {}) {
  const hub = createApp({ port: 0, publicUrl: '', ...opts });
  await new Promise(r => hub.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${hub.server.address().port}`;
  const sockets = [];
  const client = () => {
    const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(s);
    return s;
  };
  const stop = async () => { sockets.forEach(s => s.close()); await hub.close(); };
  return { hub, url, client, stop };
}

const once = (sock, ev) => new Promise(r => sock.once(ev, r));
const ack = (sock, ev, data) => new Promise(r => sock.emit(ev, data, r));
const connected = sock => (sock.connected ? Promise.resolve() : once(sock, 'connect'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { startHub, once, ack, connected, sleep };

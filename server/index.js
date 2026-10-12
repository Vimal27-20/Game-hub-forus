// Entry point: start the hub and print the addresses to open.
const { createApp, lanIP } = require('./app');

const hub = createApp();

hub.server.listen(hub.port, () => {
  const base = hub.publicUrl || `http://${lanIP()}:${hub.port}`;
  console.log('\n  HUDDLE is running');
  console.log(`  TV (host):   ${base}/tv`);
  console.log(`  Phones join: ${base}/play\n`);
});

// Hosts (Render, Fly, Docker) send SIGTERM on deploy; close sockets cleanly.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => hub.close().then(() => process.exit(0)));
}

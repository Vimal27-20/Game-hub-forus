// Runtime config. Served as-is from the hub server (same-origin, serverUrl empty).
// Packaged TV apps get a generated copy from scripts/build-tv.mjs with serverUrl set.
window.HUDDLE_CONFIG = { serverUrl: '', platform: 'web' };

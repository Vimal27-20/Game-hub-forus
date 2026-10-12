// TV platform adapter: normalises remote keys and app exit across webOS, Tizen,
// Android TV / Fire TV (Capacitor) and the plain browser.
// Spec: specs/002-tv-store-apps (requirements R3, R4).
(() => {
  const cfg = window.HUDDLE_CONFIG || {};
  const serverUrl = String(cfg.serverUrl || '').replace(/\/$/, '');
  const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  const name = cfg.platform || 'web';

  const BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack', 'XF86Back']);
  const BACK_CODES = new Set([27, 8, 461 /* webOS */, 10009 /* Tizen */]);
  const OK_KEYS = new Set(['Enter', ' ', 'Select']);

  function isBack(e) { return BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode); }
  function isOk(e) { return OK_KEYS.has(e.key) || e.keyCode === 13; }

  // Back pressed on the home screen: leave the app the way each store expects.
  function exit() {
    try {
      if (window.tizen && tizen.application) return tizen.application.getCurrentApplication().exit();
      if (cap) return cap.exitApp();
      if (name === 'webos') return window.close();
    } catch (e) { /* fall through: browsers can't close tabs they didn't open */ }
  }

  // Capacitor swallows the Android Back button; turn it into a normal key event.
  if (cap && cap.addListener) {
    cap.addListener('backButton', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'GoBack' })));
  }

  window.HuddlePlatform = {
    name, serverUrl, isBack, isOk, exit,
    // Absolute URL on the hub server ('' prefix when served same-origin).
    api: p => serverUrl + p,
    connect: () => (serverUrl ? io(serverUrl, { transports: ['websocket', 'polling'] }) : io()),
  };
})();

// Renders store icons/banners from assets/*.svg into assets/generated/ using headless Chrome.
// Run after changing the artwork: npm run icons   (set CHROME_PATH if Chrome isn't found)
// The PNGs are committed, so builds and CI don't need Chrome.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'generated');

const OUTPUTS = [
  // [file, source svg, width, height]
  ['icon.png', 'icon.svg', 80, 80], // webOS app icon
  ['largeIcon.png', 'icon.svg', 130, 130], // webOS large icon
  ['splash.png', 'banner.svg', 1920, 1080], // webOS splash
  ['tizen-icon.png', 'icon.svg', 512, 512], // Samsung Tizen
  ['banner.png', 'banner.svg', 320, 180], // Android TV / Fire TV leanback banner
  ['store-icon-512.png', 'icon.svg', 512, 512], // Google Play / Amazon listing icon
];

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = candidates.find(p => existsSync(p));
if (!chrome) { console.error('make-icons: Chrome/Edge not found. Set CHROME_PATH.'); process.exit(1); }

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'huddle-icons-'));
try {
  for (const [file, src, w, h] of OUTPUTS) {
    const svg = readFileSync(join(root, 'assets', src), 'utf8');
    const html = join(tmp, `${file}.html`);
    writeFileSync(html, `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${w}px;height:${h}px}</style></head><body>${svg}</body></html>`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
      `--window-size=${w},${h}`, `--screenshot=${join(out, file)}`, pathToFileURL(html).href], { stdio: 'ignore' });
    console.log(`make-icons: assets/generated/${file} (${w}x${h})`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

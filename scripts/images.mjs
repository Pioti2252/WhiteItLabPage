// Generates social/preview images into site/static/ (committed to the repo):
//   og/og-pl.png, og/og-en.png  (1200×630, Open Graph / Twitter / LinkedIn)
//   icon-192.png, icon-512.png, apple-touch-icon.png (180)
// Uses a locally installed Chrome/Chromium in headless mode — no npm deps.
//   npm run images            (set CHROME_PATH if Chrome isn't found)
// Re-run after changing the hero headline or the brand colours.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'site', 'static');
const tmp = mkdtempSync(join(tmpdir(), 'wl-img-'));

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && existsSync(p));
if (!chrome) throw new Error('Chrome/Chromium not found — set CHROME_PATH');

const run = (args) => execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', `--user-data-dir=${join(tmp, 'profile')}`, '--virtual-time-budget=3000',
  ...args,
], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }).toString();

const font = (pkg, file) => pathToFileURL(join(root, 'node_modules', '@fontsource-variable', pkg, 'files', file)).href;
const fontCss = `
@font-face { font-family: A; src: url(${font('archivo', 'archivo-latin-ext-wdth-normal.woff2')}); font-weight: 100 900; font-stretch: 62% 125%; unicode-range: U+0100-02BA; }
@font-face { font-family: A; src: url(${font('archivo', 'archivo-latin-wdth-normal.woff2')}); font-weight: 100 900; font-stretch: 62% 125%; unicode-range: U+0000-00FF, U+2000-206F; }
@font-face { font-family: M; src: url(${font('jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2')}); font-weight: 100 800; }`;

/* ------------------------------------------------------------ OG images --- */
mkdirSync(join(out, 'og'), { recursive: true });
for (const lang of ['pl', 'en']) {
  const t = JSON.parse(readFileSync(join(root, 'site', 'content', `${lang}.json`), 'utf8'));
  const tags = 'DevOps · CI/CD · Docker · Kubernetes · Backend';
  const html = `<!doctype html><meta charset="utf-8"><style>${fontCss}
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { background: #f3f1ec; color: #121212; font-family: A; padding: 64px 72px; display: flex; flex-direction: column; position: relative; }
  body::before { content: ""; position: absolute; inset: 0; background-image: linear-gradient(rgb(18 18 18 / .09) 1px, transparent 1px), linear-gradient(90deg, rgb(18 18 18 / .09) 1px, transparent 1px); background-size: 56px 56px; background-position: -1px -1px;
    -webkit-mask-image: radial-gradient(700px circle at 85% 20%, #000, transparent 75%); }
  .top { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; letter-spacing: -.01em; position: relative; }
  .top b { color: #ff4f1a; font-weight: 800; }
  .mark { width: 34px; height: 34px; border: 3px solid #121212; position: relative; }
  .mark::after { content: ""; position: absolute; right: 4px; bottom: 4px; width: 11px; height: 11px; background: #ff4f1a; }
  h1 { margin-top: auto; font-size: 84px; line-height: .98; font-weight: 750; font-stretch: 108%; letter-spacing: -.035em; max-width: 980px; position: relative; }
  em { font-style: normal; background: linear-gradient(#ff4f1a, #ff4f1a) no-repeat 0 88% / 100% .22em; }
  .foot { margin-top: 44px; display: flex; justify-content: space-between; align-items: center; font-family: M; font-size: 22px; letter-spacing: .02em; color: #55544f; border-top: 2px solid #121212; padding-top: 22px; position: relative; }
  .foot span:last-child { color: #121212; font-weight: 700; }
  </style>
  <div class="top"><span class="mark"></span><span>white<b>it</b>lab</span></div>
  <h1>${t.hero.title_html}</h1>
  <div class="foot"><span>${tags}</span><span>whiteitlab.com</span></div>`;
  const file = join(tmp, `og-${lang}.html`);
  writeFileSync(file, html);
  run(['--window-size=1200,630', `--screenshot=${join(out, 'og', `og-${lang}.png`)}`, pathToFileURL(file).href]);
  console.log('og', lang);
}

/* ----------------------------------------------------------------- icons --- */
// Drawn on <canvas> and returned via --dump-dom (screenshots can't go below
// Chrome's minimum window width). Paper background, ink frame, signal square;
// 12% safe padding so the icon also works when masked (Android "maskable").
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };
const iconHtml = `<!doctype html><body><script>
const out = [];
for (const [name, s] of Object.entries(${JSON.stringify(sizes)})) {
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'), u = s / 24, pad = s * 0.12, k = (s - 2 * pad) / s;
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, s, s);
  g.translate(pad, pad); g.scale(k, k);
  g.strokeStyle = '#121212'; g.lineWidth = 2.4 * u; g.strokeRect(1.5 * u, 1.5 * u, 21 * u, 21 * u);
  g.fillStyle = '#ff4f1a'; g.fillRect(12 * u, 12 * u, 7 * u, 7 * u);
  out.push(name + '|' + c.toDataURL('image/png'));
}
document.body.textContent = out.join('\\n');
</script>`;
const iconFile = join(tmp, 'icons.html');
writeFileSync(iconFile, iconHtml);
const dom = run(['--dump-dom', pathToFileURL(iconFile).href]);
for (const [, name, b64] of dom.matchAll(/([\w-]+\.png)\|data:image\/png;base64,([A-Za-z0-9+/=]+)/g)) {
  writeFileSync(join(out, name), Buffer.from(b64, 'base64'));
  console.log('icon', name);
}

rmSync(tmp, { recursive: true, force: true });

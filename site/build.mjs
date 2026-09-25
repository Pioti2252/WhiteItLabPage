// Static build: content/*.json + page.mjs -> dist/
// CSS/JS/fonts get a content hash in their filename so they can be cached forever.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, status } from './page.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, '..', 'dist');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

const cfg = json('config.json');
const pl = json('content/pl.json');
const en = json('content/en.json');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets', 'fonts'), { recursive: true });

const write = (rel, data) => {
  const out = join(dist, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
};

const assets = {};

// Self-hosted fonts (latin + latin-ext is enough for PL/EN), renamed with a hash.
const fontDir = join(root, '..', 'node_modules', '@fontsource-variable');
const fontNames = {};
for (const [pkg, file] of [
  ['archivo', 'archivo-latin-wdth-normal.woff2'],
  ['archivo', 'archivo-latin-ext-wdth-normal.woff2'],
  ['jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
  ['jetbrains-mono', 'jetbrains-mono-latin-ext-wght-normal.woff2'],
]) {
  const buf = readFileSync(join(fontDir, pkg, 'files', file));
  const hashed = file.replace(/\.woff2$/, `.${hash(buf)}.woff2`);
  fontNames[file] = hashed;
  write(join('assets', 'fonts', hashed), buf);
}
assets.fontPreload = fontNames['archivo-latin-wdth-normal.woff2'];

// Hashed CSS/JS (CSS font URLs are rewritten to the hashed names first)
for (const [key, file] of [['css', 'style.css'], ['js', 'main.js'], ['theme', 'theme.js']]) {
  let src = read(join('assets', file));
  if (key === 'css') {
    src = src.replace(/\/assets\/fonts\/([\w.-]+\.woff2)/g, (m, name) => {
      if (!fontNames[name]) throw new Error(`style.css references unknown font ${name}`);
      return `/assets/fonts/${fontNames[name]}`;
    });
  }
  const [name, ext] = file.split('.');
  assets[key] = `${name}.${hash(src)}.${ext}`;
  write(join('assets', assets[key]), src);
}

// Files served as-is from the site root: favicon, icons, OG images, manifest.
// (Regenerate images with `npm run images` — see docs/SEO.md.)
cpSync(join(root, 'assets', 'favicon.svg'), join(dist, 'favicon.svg'));
const staticDir = join(root, 'static');
if (existsSync(staticDir)) cpSync(staticDir, dist, { recursive: true });

// Pages
for (const [t, alt] of [[pl, en], [en, pl]]) {
  const base = t.path; // "/" or "/en/"
  write(join(base, 'index.html'), home({ t, alt, cfg, assets }));
  write(join(base, 'thanks', 'index.html'), status({ t, alt, cfg, assets, kind: 'thanks' }));
  write(join(base, 'error', 'index.html'), status({ t, alt, cfg, assets, kind: 'error' }));
  write(join(base, '404.html'), status({ t, alt, cfg, assets, kind: 404 }));
}

// Status pages (/thanks/, /error/) are NOT disallowed on purpose: they carry
// <meta name="robots" content="noindex">, which crawlers can only see if allowed in.
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);

// lastmod = build date. Content only changes on a rebuild, so this is accurate.
const lastmod = new Date().toISOString().slice(0, 10);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[pl, en].map((t) => `  <url>
    <loc>${cfg.siteUrl}${t.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <xhtml:link rel="alternate" hreflang="pl" href="${cfg.siteUrl}${pl.path}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${cfg.siteUrl}${en.path}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${cfg.siteUrl}/"/>
    <image:image><image:loc>${cfg.siteUrl}/og/og-${t.lang}.png</image:loc></image:image>
  </url>`).join('\n')}
</urlset>
`);

console.log('built ->', dist, assets);

// Static build: content/*.json + page.mjs -> dist/
// CSS/JS get a content hash in their filename so they can be cached forever.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { home, status } from './page.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, '..', 'dist');
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

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

// Hashed assets
const assets = {};
for (const [key, file] of [['css', 'style.css'], ['js', 'main.js'], ['theme', 'theme.js']]) {
  const src = read(join('assets', file));
  const hash = createHash('sha256').update(src).digest('hex').slice(0, 10);
  const [name, ext] = file.split('.');
  assets[key] = `${name}.${hash}.${ext}`;
  write(join('assets', assets[key]), src);
}

// Self-hosted fonts (latin + latin-ext is enough for PL/EN)
const fonts = join(root, '..', 'node_modules', '@fontsource-variable');
for (const [pkg, file] of [
  ['archivo', 'archivo-latin-wdth-normal.woff2'],
  ['archivo', 'archivo-latin-ext-wdth-normal.woff2'],
  ['jetbrains-mono', 'jetbrains-mono-latin-wght-normal.woff2'],
  ['jetbrains-mono', 'jetbrains-mono-latin-ext-wght-normal.woff2'],
]) {
  cpSync(join(fonts, pkg, 'files', file), join(dist, 'assets', 'fonts', file));
}

cpSync(join(root, 'assets', 'favicon.svg'), join(dist, 'favicon.svg'));

// Pages
for (const [t, alt] of [[pl, en], [en, pl]]) {
  const base = t.path; // "/" or "/en/"
  write(join(base, 'index.html'), home({ t, alt, cfg, assets }));
  write(join(base, 'thanks', 'index.html'), status({ t, alt, cfg, assets, kind: 'thanks' }));
  write(join(base, 'error', 'index.html'), status({ t, alt, cfg, assets, kind: 'error' }));
  write(join(base, '404.html'), status({ t, alt, cfg, assets, kind: 404 }));
}

write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[pl, en].map((t) => `  <url>
    <loc>${cfg.siteUrl}${t.path}</loc>
    <xhtml:link rel="alternate" hreflang="pl" href="${cfg.siteUrl}${pl.path}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${cfg.siteUrl}${en.path}"/>
  </url>`).join('\n')}
</urlset>
`);

console.log('built ->', dist, assets);

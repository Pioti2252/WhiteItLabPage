// Integration test: starts the real server (dry-run mail) on a free port.
// Requires `npm run build` first (dist/ must exist).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const freePort = () => new Promise((res) => {
  const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); });
});

let proc, base, origin;

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  origin = base;
  proc = spawn(process.execPath, [fileURLToPath(new URL('../server/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MAIL_DRY_RUN: '1', ALLOWED_ORIGINS: origin, RATE_LIMIT_PER_IP: '3' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => proc.stdout.on('data', (d) => String(d).includes('listening') && res()));
});
after(() => proc.kill('SIGTERM'));

const post = (body, headers = {}) =>
  fetch(`${base}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });

test('serves pages with security headers', async () => {
  for (const p of ['/', '/en/']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('path traversal and unknown paths are 404', async () => {
  assert.equal((await fetch(`${base}/..%2f..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/server/server.mjs`)).status, 404);
});

test('/en redirects to /en/', async () => {
  const r = await fetch(`${base}/en`, { redirect: 'manual' });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), '/en/');
});

test('healthz', async () => {
  assert.equal(await (await fetch(`${base}/healthz`)).text(), 'ok');
});

test('contact: foreign origin is rejected', async () => {
  assert.equal((await post({}, { Origin: 'https://evil.example' })).status, 403);
});

test('contact: oversized body -> 413', async () => {
  assert.equal((await post('x'.repeat(20_000))).status, 413);
});

test('contact: validation errors -> 422, then rate limit -> 429', async () => {
  const r = await post({ name: 'J' });
  assert.equal(r.status, 422);
  assert.ok((await r.json()).fields.includes('email'));
  await post({});
  assert.equal((await post({})).status, 429);
});

/* ------------------------------------------------------------------ SEO --- */
const page = async (p) => (await fetch(base + p)).text();

test('JSON-LD is valid and describes business, site, page and FAQ', async () => {
  for (const [p, lang] of [['/', 'pl'], ['/en/', 'en']]) {
    const html = await page(p);
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, `no JSON-LD on ${p}`);
    const data = JSON.parse(m[1]);
    const types = data['@graph'].map((n) => n['@type']);
    assert.deepEqual(types, ['ProfessionalService', 'WebSite', 'WebPage', 'FAQPage']);
    const faq = data['@graph'][3];
    assert.ok(faq.mainEntity.length >= 3);
    // every FAQ question in the markup must also be visible on the page
    for (const q of faq.mainEntity) assert.ok(html.includes(q.name), `FAQ not visible: ${q.name}`);
    assert.equal(data['@graph'][2].inLanguage, lang === 'pl' ? 'pl-PL' : 'en');
  }
});

test('meta: one h1, canonical, hreflang, OG image, description length', async () => {
  const html = await page('/');
  assert.equal(html.match(/<h1[\s>]/g).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/whiteitlab\.com\/">/);
  assert.match(html, /hreflang="en" href="https:\/\/whiteitlab\.com\/en\/"/);
  assert.match(html, /hreflang="x-default"/);
  assert.match(html, /property="og:image" content="https:\/\/whiteitlab\.com\/og\/og-pl\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(desc.length >= 70 && desc.length <= 160, `description length ${desc.length}`);
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length <= 60, `title length ${title.length}`);
});

test('status pages are noindex and not in the sitemap', async () => {
  assert.match(await page('/thanks/'), /<meta name="robots" content="noindex/);
  const sitemap = await page('/sitemap.xml');
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.ok(!sitemap.includes('/thanks/'));
});

test('OG images, icons and manifest are served', async () => {
  for (const p of ['/og/og-pl.png', '/og/og-en.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('content-type'), 'image/png');
  }
  const m = await fetch(`${base}/site.webmanifest`);
  assert.equal(m.status, 200);
  assert.ok((await m.json()).icons.length >= 2);
});

test('compression: brotli preferred, gzip fallback, identity when refused', async () => {
  const get = (ae) => new Promise((res) => {
    import('node:http').then(({ get }) => get(`${base}/`, { headers: { 'accept-encoding': ae } }, (r) => { r.resume(); res(r.headers); }));
  });
  assert.equal((await get('gzip, deflate, br'))['content-encoding'], 'br');
  assert.equal((await get('gzip'))['content-encoding'], 'gzip');
  assert.equal((await get('br;q=0, gzip;q=0'))['content-encoding'], undefined);
  assert.equal((await get('gzip, br')).vary, 'Accept-Encoding');
});

test('hashed fonts are cached immutably', async () => {
  const html = await page('/');
  const font = html.match(/href="(\/assets\/fonts\/[^"]+\.[0-9a-f]{10}\.woff2)"/)[1];
  const r = await fetch(base + font);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /immutable/);
});

test('CONTACT_ENABLED=0 refuses submissions with 503', async () => {
  const port = await freePort();
  const p = spawn(process.execPath, [fileURLToPath(new URL('../server/server.mjs', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', MAIL_DRY_RUN: '1', CONTACT_ENABLED: '0', ALLOWED_ORIGINS: `http://127.0.0.1:${port}` },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    await new Promise((res) => p.stdout.on('data', (d) => String(d).includes('listening') && res()));
    const r = await fetch(`http://127.0.0.1:${port}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'contact_disabled');
  } finally {
    p.kill('SIGTERM');
  }
});

test('disabled form: fieldset disabled + notice when contactFormEnabled is false', async () => {
  const html = await page('/');
  const cfg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../site/config.json', import.meta.url), 'utf8'));
  if (cfg.contactFormEnabled === false) {
    assert.match(html, /<form [^>]*data-disabled/);
    assert.match(html, /<fieldset class="form-fields" disabled>/);
    assert.match(html, /class="form-off"/);
  } else {
    assert.doesNotMatch(html, /<fieldset class="form-fields" disabled>/);
  }
});

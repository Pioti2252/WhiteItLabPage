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

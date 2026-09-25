// whiteitlab web server
// - serves the prebuilt static site from memory (whitelist = files that exist at startup)
// - POST /api/contact -> validates, rate-limits, sends an e-mail over SMTP
// - GET /healthz -> liveness for Docker / monitoring
// No framework on purpose: the attack surface is this file plus nodemailer.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { validateContact } from './validate.mjs';
import { RateLimiter } from './ratelimit.mjs';
import { createMailer } from './mailer.mjs';

const cfg = loadConfig(process.env);
const log = (level, msg, extra = {}) =>
  process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + '\n');

/* ------------------------------------------------------------ static --- */
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Load every file once. Requests can only ever hit keys of this map, so path
// traversal ("/../../etc/passwd") is impossible by construction.
const files = new Map();
(function load(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { load(full); continue; }
    const type = TYPES[extname(name)];
    if (!type) continue;
    const body = readFileSync(full);
    const urlPath = '/' + relative(DIST, full).split(sep).join('/');
    files.set(urlPath, {
      body,
      type,
      etag: '"' + createHash('sha1').update(body).digest('base64url').slice(0, 16) + '"',
      cache: /^\/assets\/.+\.[0-9a-f]{10}\.(css|js)$/.test(urlPath)
        ? 'public, max-age=31536000, immutable'
        : urlPath.startsWith('/assets/fonts/')
          ? 'public, max-age=2592000'
          : 'public, max-age=300, must-revalidate',
    });
  }
})(DIST);
log('info', 'static files loaded', { count: files.size });

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });

function resolveStatic(pathname) {
  if (files.has(pathname)) return pathname;
  if (pathname.endsWith('/') && files.has(pathname + 'index.html')) return pathname + 'index.html';
  return null;
}

function serveStatic(req, res, pathname) {
  // Directory without trailing slash -> canonical redirect ("/en" -> "/en/")
  if (!pathname.endsWith('/') && files.has(pathname + '/index.html')) {
    return send(res, 301, '', { Location: pathname + '/' });
  }
  const key = resolveStatic(pathname);
  if (!key) {
    const notFound = files.get(pathname.startsWith('/en/') ? '/en/404.html' : '/404.html');
    return send(res, 404, req.method === 'HEAD' ? '' : notFound.body, { 'Content-Type': notFound.type, 'Cache-Control': 'no-store' });
  }
  const f = files.get(key);
  if (req.headers['if-none-match'] === f.etag) {
    return send(res, 304, '', { ETag: f.etag, 'Cache-Control': f.cache });
  }
  send(res, 200, req.method === 'HEAD' ? '' : f.body, {
    'Content-Type': f.type,
    'Content-Length': f.body.length,
    'Cache-Control': f.cache,
    ETag: f.etag,
  });
}

/* ----------------------------------------------------------- contact --- */
const perIp = new RateLimiter({ limit: cfg.rateLimitPerIp, windowMs: cfg.rateLimitWindowMs });
const globalLimiter = new RateLimiter({ limit: cfg.rateLimitGlobal, windowMs: 60 * 60 * 1000 });
const mailer = createMailer(cfg, log);

function clientIp(req) {
  // Only trust the proxy header when we know a proxy (nginx) is in front.
  if (cfg.trustProxy) {
    const real = req.headers['x-real-ip'];
    if (typeof real === 'string' && real.length < 64) return real.trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (c) => {
      if (tooLarge) return; // discard the rest; the 413 closes the connection
      size += c.length;
      if (size > limit) { tooLarge = true; chunks.length = 0; reject(Object.assign(new Error('too large'), { status: 413 })); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

async function handleContact(req, res) {
  const ctype = (req.headers['content-type'] || '').split(';')[0].trim();
  const isJson = ctype === 'application/json';
  const isForm = ctype === 'application/x-www-form-urlencoded';

  // No-JS fallback answers with redirects to static result pages.
  const reply = (status, payload, lang = 'pl') => {
    if (isJson) return json(res, status, payload);
    const base = lang === 'en' ? '/en/' : '/';
    return send(res, 303, '', { Location: base + (payload.ok ? 'thanks/' : 'error/'), 'Cache-Control': 'no-store' });
  };

  if (!isJson && !isForm) return json(res, 415, { ok: false, error: 'unsupported_media_type' });

  // Browsers always send Origin on cross-site POST. Reject foreign origins (CSRF-style abuse).
  const origin = req.headers.origin;
  if (origin && !cfg.allowedOrigins.includes(origin)) {
    log('warn', 'contact rejected: origin', { origin });
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const ip = clientIp(req);
  if (!perIp.hit(ip) || !globalLimiter.hit('all')) {
    log('warn', 'contact rate limited');
    return isJson
      ? json(res, 429, { ok: false, error: 'rate_limited' }, { 'Retry-After': String(Math.ceil(cfg.rateLimitWindowMs / 1000)) })
      : reply(429, { ok: false });
  }

  let raw;
  try {
    raw = await readBody(req, cfg.maxBodyBytes);
  } catch (e) {
    return json(res, e.status || 400, { ok: false, error: e.status === 413 ? 'payload_too_large' : 'bad_request' }, { Connection: 'close' });
  }

  let input;
  try {
    input = isJson ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return json(res, 400, { ok: false, error: 'bad_json' });
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json(res, 400, { ok: false, error: 'bad_request' });

  const result = validateContact(input, Date.now());
  const lang = result.data?.lang || 'pl';

  if (result.spam) {
    // Pretend success so bots don't learn what tripped them.
    log('info', 'contact dropped as spam', { reason: result.spam });
    return reply(200, { ok: true }, lang);
  }
  if (result.errors.length) return reply(422, { ok: false, error: 'validation', fields: result.errors }, lang);

  try {
    await mailer.send(result.data);
    log('info', 'contact sent', { topic: result.data.topic, lang });
    return reply(200, { ok: true }, lang);
  } catch (e) {
    log('error', 'mail send failed', { err: e.code || e.message });
    return reply(502, { ok: false, error: 'mail_failed' }, lang);
  }
}

/* ------------------------------------------------------------ server --- */
const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain' });
  }

  try {
    if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });

    if (pathname === '/api/contact') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST' });
      return await handleContact(req, res);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
    }
    return serveStatic(req, res, pathname);
  } catch (e) {
    log('error', 'unhandled', { err: e.message });
    if (!res.headersSent) send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain' });
  }
});

server.headersTimeout = 15_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 65_000; // > nginx upstream keepalive_timeout (60s)

server.listen(cfg.port, cfg.host, () => log('info', 'listening', { host: cfg.host, port: cfg.port, dryRun: cfg.mailDryRun }));

// Graceful shutdown: docker stop sends SIGTERM, then SIGKILL after 10s.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log('info', 'shutting down', { sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  });
}

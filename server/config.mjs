// All configuration comes from environment variables (12-factor).
// Fails fast on startup instead of failing on the first form submission.
import { readFileSync } from 'node:fs';

const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

// VAR_FILE wins over VAR, so secrets can come from Docker secrets (/run/secrets/...).
function secret(env, name) {
  const file = env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim();
  return env[name];
}

export function loadConfig(env) {
  const cfg = {
    host: env.HOST || '0.0.0.0',
    port: int(env.PORT, 8080),
    trustProxy: bool(env.TRUST_PROXY, false),
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://whiteitlab.com,https://www.whiteitlab.com')
      .split(',').map((s) => s.trim()).filter(Boolean),
    maxBodyBytes: int(env.MAX_BODY_BYTES, 16 * 1024),
    rateLimitPerIp: int(env.RATE_LIMIT_PER_IP, 5),
    rateLimitWindowMs: int(env.RATE_LIMIT_WINDOW_MIN, 15) * 60 * 1000,
    rateLimitGlobal: int(env.RATE_LIMIT_GLOBAL_PER_HOUR, 60),

    mailDryRun: bool(env.MAIL_DRY_RUN, false),
    smtp: {
      host: env.SMTP_HOST,
      port: int(env.SMTP_PORT, 587),
      secure: bool(env.SMTP_SECURE, false), // true = implicit TLS (465); false = STARTTLS (587)
      user: env.SMTP_USER,
      pass: secret(env, 'SMTP_PASS'),
    },
    mailFrom: env.MAIL_FROM,
    mailTo: env.MAIL_TO,
  };

  if (!cfg.mailDryRun) {
    const missing = [
      ['SMTP_HOST', cfg.smtp.host],
      ['MAIL_FROM', cfg.mailFrom],
      ['MAIL_TO', cfg.mailTo],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      throw new Error(`Missing required env: ${missing.join(', ')} (or set MAIL_DRY_RUN=1 for local development)`);
    }
  }
  return cfg;
}

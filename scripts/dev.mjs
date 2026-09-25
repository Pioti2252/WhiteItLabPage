// Local development: build the site, then start the server in dry-run mode
// (form submissions are logged, not e-mailed). Cross-platform, no cross-env.
process.env.MAIL_DRY_RUN ??= '1';
process.env.PORT ??= '8080';
process.env.ALLOWED_ORIGINS ??= `http://localhost:${process.env.PORT},http://127.0.0.1:${process.env.PORT}`;
await import('../site/build.mjs');
await import('../server/server.mjs');

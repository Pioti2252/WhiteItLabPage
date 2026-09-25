// Used by Docker HEALTHCHECK. Distroless has no shell/curl/wget, so the
// check is a tiny Node script. Exit 0 = healthy, 1 = unhealthy.
import { get } from 'node:http';

const req = get({ host: '127.0.0.1', port: process.env.PORT || 8080, path: '/healthz', timeout: 3000 }, (res) => {
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on('timeout', () => { req.destroy(); process.exit(1); });
req.on('error', () => process.exit(1));

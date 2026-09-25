// Fixed-window in-memory rate limiter. Good enough for a single container;
// nginx `limit_req` sits in front as the first line of defence.
export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> { count, resetAt }
    // Periodic cleanup so the map can't grow without bound.
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }, Math.min(windowMs, 60_000)).unref();
  }

  /** @returns {boolean} true if allowed */
  hit(key) {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count += 1;
    return e.count <= this.limit;
  }
}

import NodeCache from 'node-cache';

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX) || 10;
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW) || 60000;

export class RateLimiter {
  constructor() {
    this.cache = new NodeCache({ stdTTL: WINDOW_MS / 1000 });
  }

  /**
   * Check if user is within rate limit
   */
  checkLimit(userId) {
    const key = `rate_${userId}`;
    const current = this.cache.get(key) || 0;

    if (current >= MAX_REQUESTS) {
      return false;
    }

    this.cache.set(key, current + 1);
    return true;
  }

  /**
   * Reset rate limit for user
   */
  reset(userId) {
    this.cache.del(`rate_${userId}`);
  }
}

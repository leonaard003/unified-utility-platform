import { AppError } from './errors';

/**
 * In-memory fixed-window rate limiter.
 *
 * Scope note (honest limitation): this counts per Node process. It is the right
 * amount of protection for the single-VPS deployment the PRD targets, but it does
 * NOT coordinate across multiple instances behind a load balancer — swap in Redis
 * if the platform is ever scaled horizontally.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitRule {
  /** Bucket name, e.g. 'convert'. */
  key: string;
  limit: number;
  windowMs: number;
}

export const RULES = {
  transcript: { key: 'transcript', limit: 20, windowMs: 60_000 },
  downloadProbe: { key: 'download-probe', limit: 15, windowMs: 60_000 },
  downloadFetch: { key: 'download-fetch', limit: 5, windowMs: 60_000 },
  convert: { key: 'convert', limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Throws AppError('RATE_LIMITED') when the caller is over budget. */
export function enforceRateLimit(req: Request, rule: RateLimitRule): void {
  const now = Date.now();
  const id = `${rule.key}:${clientIp(req)}`;
  const existing = buckets.get(id);

  if (!existing || now >= existing.resetAt) {
    buckets.set(id, { count: 1, resetAt: now + rule.windowMs });
    if (buckets.size > 5_000) prune(now);
    return;
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    const seconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new AppError('RATE_LIMITED', `Too many requests. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`, {
      hint: `This endpoint allows ${rule.limit} requests per ${Math.round(rule.windowMs / 1000)} seconds.`,
    });
  }
}

function prune(now: number): void {
  for (const [id, window] of buckets) {
    if (now >= window.resetAt) buckets.delete(id);
  }
}

/** Test hook. */
export function resetRateLimits(): void {
  buckets.clear();
}

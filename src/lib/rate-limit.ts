import { NextResponse } from "next/server";

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

/**
 * In-memory fixed-window rate limiter.
 * For production with multiple instances, swap for Redis / Upstash.
 */
export function rateLimit(
  key: string,
  max = Number(process.env.RATE_LIMIT_MAX ?? 5),
  windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return { limited: true, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

/**
 * Helper to return a 429 response when limited.
 */
export function rateLimitedResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
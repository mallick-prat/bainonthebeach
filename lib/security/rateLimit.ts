// Small in-memory sliding-window rate limiter, per serverless instance.
// Good enough for a microsite; swap for Upstash/Supabase counters if the
// deployment needs cross-instance guarantees (documented in README).

const windows = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retryAfterMs = windowMs - (now - hits[0]!);
    windows.set(key, hits);
    return { ok: false, retryAfterMs };
  }
  hits.push(now);
  windows.set(key, hits);
  // Opportunistic cleanup.
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (v.every((t) => now - t > windowMs)) windows.delete(k);
    }
  }
  return { ok: true, retryAfterMs: 0 };
}

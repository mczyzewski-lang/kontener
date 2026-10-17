/**
 * In-memory token-bucket rate limiter.
 *
 * NOTE: serverless instances (Vercel functions) do not share memory, and instances are recycled,
 * so these limits are per instance and best-effort. To enforce global limits, implement
 * `RateLimitStore` on top of a shared store (e.g. Upstash Redis `INCR` + `EXPIRE`, or a Postgres
 * table with an atomic UPDATE … RETURNING) and pass it to `setRateLimitStore()` at startup.
 */
export interface BucketConfig {
  /** Max burst. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
}

export interface RateLimitStore {
  /** Consume one token; returns ms to wait when limited, or 0 when allowed. */
  take(key: string, cfg: BucketConfig): Promise<number> | number;
}

export const BUCKETS = {
  default: { capacity: 120, refillPerSec: 2 },
  sync: { capacity: 6, refillPerSec: 0.2 },
  send: { capacity: 20, refillPerSec: 0.2 },
  search: { capacity: 30, refillPerSec: 0.5 },
  auth: { capacity: 20, refillPerSec: 0.2 },
} satisfies Record<string, BucketConfig>;

export type BucketName = keyof typeof BUCKETS;

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { tokens: number; at: number }>();

  take(key: string, cfg: BucketConfig): number {
    const now = Date.now();
    if (this.buckets.size > 10_000) this.prune(now);
    const b = this.buckets.get(key) ?? { tokens: cfg.capacity, at: now };
    b.tokens = Math.min(cfg.capacity, b.tokens + ((now - b.at) / 1000) * cfg.refillPerSec);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return Math.ceil(((1 - b.tokens) / cfg.refillPerSec) * 1000);
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return 0;
  }

  private prune(now: number) {
    for (const [k, v] of this.buckets) if (now - v.at > 10 * 60_000) this.buckets.delete(k);
    if (this.buckets.size > 10_000) this.buckets.clear();
  }

  reset() {
    this.buckets.clear();
  }
}

const memory = new MemoryStore();
let store: RateLimitStore = memory;

export function setRateLimitStore(s: RateLimitStore): void {
  store = s;
}

export function resetRateLimits(): void {
  memory.reset();
}

/** Returns ms to wait (0 = allowed). */
export async function takeToken(bucket: BucketName, key: string): Promise<number> {
  return store.take(`${bucket}:${key}`, BUCKETS[bucket]);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

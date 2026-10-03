/**
 * Rate limiter + retry cho crawler Oxford (VU-32 SF-1) — PURE, timers qua
 * injectable sleep (fake-timers test được).
 *
 * - createTokenBucket({rate}): pacing tối thiểu 1000/rate ms giữa 2 outbound
 *   call (mặc định runner 2 r/s — politeness; vẫn trượt vì call thật chạy
 *   song song với wait, đúng ý: KHÔNG burst).
 * - withRetry(fn, {retries, baseMs}): retry khi `err.retryable === true`
 *   (HttpError 429/5xx, Timeout, Network — xem ./fetch.ts); backoff
 *   exponential + jitter; non-retryable (404/403/SizeCap/Host) throw ngay.
 */

export type SleepFn = (ms: number) => Promise<void>;

export function createTokenBucket(
  { rate, sleep = defaultSleep }: { rate: number; sleep?: SleepFn } = { rate: 2 },
): () => Promise<void> {
  const intervalMs = 1000 / rate;
  let lastAcquire = -Infinity;
  return async () => {
    const now = Date.now();
    const waitMs = lastAcquire + intervalMs - now;
    if (waitMs > 0) await sleep(waitMs);
    lastAcquire = Date.now();
  };
}

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  retries?: number;
  baseMs?: number;
  sleep?: SleepFn;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseMs = 1_000, sleep = defaultSleep } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = (err as { retryable?: boolean })?.retryable === true;
      if (!retryable || attempt === retries) break;
      // backoff exponential + jitter (±25%) — tránh thundering-herd cùng lúc
      const backoff = baseMs * 2 ** attempt;
      const jitter = backoff * (0.75 + Math.random() * 0.5);
      await sleep(jitter);
    }
  }
  throw lastError;
}

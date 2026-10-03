import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenBucket, withRetry } from "./rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("createTokenBucket — pacing 1000/rate ms giữa 2 call", () => {
  it("rate 2: 4 acquire trong ~1.5s (0, 500, 1000, 1500) — không burst", async () => {
    vi.useFakeTimers();
    const sleeps: number[] = [];
    const acquire = createTokenBucket({
      rate: 2,
      sleep: async (ms) => {
        sleeps.push(ms);
        vi.advanceTimersByTime(ms);
      },
    });
    const t0 = Date.now();
    for (let i = 0; i < 4; i++) await acquire();
    // mỗi call sau đầu chờ đúng 1 interval (pacing delta đều, không cộng dồn)
    expect(sleeps).toEqual([500, 500, 500]);
    expect(Date.now() - t0).toBe(1500);
  });

  it("rate 5: interval 200ms", async () => {
    vi.useFakeTimers();
    const acquire = createTokenBucket({
      rate: 5,
      sleep: async (ms) => {
        vi.advanceTimersByTime(ms);
      },
    });
    await acquire();
    const before = Date.now();
    await acquire();
    expect(Date.now() - before).toBe(200);
  });
});

describe("withRetry — chỉ retry khi err.retryable", () => {
  const retryableErr = Object.assign(new Error("429"), { retryable: true });
  const fatalErr = Object.assign(new Error("403"), { retryable: false });

  it("retryable fail 2 lần rồi success → kết quả OK, đủ sleep backoff", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw retryableErr;
        return "ok";
      },
      { retries: 3, baseMs: 100, sleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2); // backoff sau mỗi lần fail
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(75); // 100 * jitter(0.75-1.25)
    expect(sleep.mock.calls[1][0]).toBeGreaterThanOrEqual(150); // 200 * jitter
  });

  it("non-retryable → throw NGAY, đúng 1 call", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw fatalErr;
      }, { retries: 3, sleep }),
    ).rejects.toThrow("403");
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("hết retries → throw lỗi cuối", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw retryableErr;
      }, { retries: 2, baseMs: 10, sleep: async () => {} }),
    ).rejects.toThrow("429");
    expect(calls).toBe(3); // attempt đầu + 2 retry
  });
});

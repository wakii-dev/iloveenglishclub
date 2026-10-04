import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/admin/vocabulary/crawl/stats (VU-32 SF-2) — shape PIN context
 * pack §4: {counts:{pending,parsed,failed,failedMaxAttempts}, samples:
 * failed[](slug+last_error, ≤20), lastRun: max(fetched_at)} — DERIVED.
 * assertAdmin MỌI method.
 */
const guardsMock = vi.hoisted(() => ({ assertAdmin: vi.fn() }));
vi.mock("@/lib/content/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  return { ForbiddenError, assertAdmin: guardsMock.assertAdmin };
});
const statsMock = vi.hoisted(() => ({ crawlStatsDb: vi.fn() }));
vi.mock("@/lib/oxford/enrich", () => ({ crawlStatsDb: statsMock.crawlStatsDb }));

const { GET } = await import("./route");

const { ForbiddenError } = await import("@/lib/content/guards");

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  statsMock.crawlStatsDb.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/vocabulary/crawl/stats", () => {
  it("thiếu admin → 401/403, không chạm lib", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(statsMock.crawlStatsDb).not.toHaveBeenCalled();
  });

  it("200 shape pin: counts + samples + lastRun", async () => {
    statsMock.crawlStatsDb.mockResolvedValue({
      counts: { pending: 10, parsed: 83, failed: 3, failedMaxAttempts: 1 },
      samples: [{ slug: "ghost", lastError: "http:404" }],
      lastRun: "2026-10-04T10:00:00.000Z",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      counts: { pending: 10, parsed: 83, failed: 3, failedMaxAttempts: 1 },
      samples: [{ slug: "ghost", lastError: "http:404" }],
      lastRun: "2026-10-04T10:00:00.000Z",
    });
  });

  it("lỗi lib → 500 generic", async () => {
    statsMock.crawlStatsDb.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

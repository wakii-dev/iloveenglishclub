import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/admin/vocabulary/stats (VU-43 SF-1) — contract shape spec §4:
 * {ok, totals:{words,withAudio,withImage,orphan,enriched}, cefrHistogram:
 * {A1..C2,untagged,other}, perSource, perBook:[{bookId,title,words,withAudio}],
 * crawl:{parsed,pending,failed,failedMaxAttempts,...}}. assertAdmin MỌI call.
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
const storeMock = vi.hoisted(() => ({ cmsStatsDb: vi.fn() }));
vi.mock("@/lib/admin/cms-stats-store", () => ({ cmsStatsDb: storeMock.cmsStatsDb }));

const { GET } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

const statsFixture = {
  totals: { words: 10, withAudio: 4, withImage: 2, orphan: 3, enriched: 6 },
  cefrHistogram: { A1: 1, A2: 2, B1: 1, B2: 0, C1: 0, C2: 0, untagged: 5, other: 1 },
  perSource: { "oxford-ld": 6, teacher: 4 },
  perBook: [{ bookId: 1, title: "Level 1", words: 4, withAudio: 2 }],
  crawl: {
    counts: { pending: 100, parsed: 63837, failed: 0, failedMaxAttempts: 0 },
    samples: [],
    lastRun: "2026-10-10T00:00:00.000Z",
  },
};

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.cmsStatsDb.mockReset().mockResolvedValue(statsFixture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/vocabulary/stats", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(storeMock.cmsStatsDb).not.toHaveBeenCalled();
  });

  it("200 shape pin §4: ok + totals + histogram + perSource + perBook + crawl", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ...statsFixture });
  });

  it("lỗi lib → 500 generic", async () => {
    storeMock.cmsStatsDb.mockRejectedValue(new Error("boom"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

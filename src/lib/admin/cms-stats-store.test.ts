import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * cms-stats-store (VU-43 SF-1 task 8) — bucket rule §5.8 PURE pin ('b2 ' →
 * other, NULL → untagged, exact A1..C2) + aggregation pass-through + TỔNG
 * buckets = tổng words (histogram group từ cùng bảng words).
 */
const dbState = vi.hoisted(() => ({ queue: [] as unknown[] }));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p = Promise.resolve(result);
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    delete: () => chainOf(),
  },
}));
const crawlStatsDb = vi.hoisted(() => vi.fn());
vi.mock("@/lib/oxford/enrich", () => ({ crawlStatsDb }));

import { cefrBucket, cmsStatsDb, type CefrHistogram } from "./cms-stats-store";

afterEach(() => {
  dbState.queue = [];
  crawlStatsDb.mockReset();
});

describe("cefrBucket (§5.8 — PURE pin)", () => {
  it("'b2 ' (dữ) → other; NULL → untagged; exact A1..C2 giữ bucket", () => {
    expect(cefrBucket("b2 ")).toBe("other");
    expect(cefrBucket("b1")).toBe("other"); // raw lowercase ≠ exact match
    expect(cefrBucket(null)).toBe("untagged");
    expect(cefrBucket("B1")).toBe("B1");
    expect(cefrBucket("C2")).toBe("C2");
    expect(cefrBucket("Pre-A1")).toBe("other");
  });

  it("histogram aggregation: tổng buckets = tổng words (cùng bảng group)", async () => {
    crawlStatsDb.mockResolvedValue({
      counts: { pending: 0, parsed: 0, failed: 0, failedMaxAttempts: 0 },
      samples: [],
      lastRun: null,
    });
    dbState.queue = [
      [{ words: 6, withAudio: 2, withImage: 1, enriched: 3 }], // totals
      [{ n: 1 }], // orphan
      // raw groups: 'A1'×2, 'b2 '×1, null×3 → buckets A1=2, other=1, untagged=3
      [{ cefr: "A1", n: 2 }, { cefr: "b2 ", n: 1 }, { cefr: null, n: 3 }],
      [{ source: "oxford-ld", n: 3 }, { source: null, n: 3 }], // perSource
      [{ bookId: 1, title: "Level 1", words: 4, withAudio: 2 }], // perBook
    ];
    const stats = await cmsStatsDb();
    expect(stats.totals).toEqual({ words: 6, withAudio: 2, withImage: 1, orphan: 1, enriched: 3 });
    const h = stats.cefrHistogram as CefrHistogram;
    expect(h.A1).toBe(2);
    expect(h.other).toBe(1);
    expect(h.untagged).toBe(3);
    expect(h.B2).toBe(0);
    const bucketTotal = Object.values(h).reduce((a, b) => a + b, 0);
    expect(bucketTotal).toBe(stats.totals.words); // §5.8 tổng = tổng words
    expect(stats.perSource).toEqual({ "oxford-ld": 3, teacher: 3 });
    expect(stats.perBook).toEqual([{ bookId: 1, title: "Level 1", words: 4, withAudio: 2 }]);
    expect(stats.crawl.counts.parsed).toBe(0);
  });

  it("buckets thiếu mặt định nghĩa 0 — không undefined (shape JSON ổn định)", async () => {
    crawlStatsDb.mockResolvedValue({
      counts: { pending: 0, parsed: 0, failed: 0, failedMaxAttempts: 0 },
      samples: [],
      lastRun: null,
    });
    dbState.queue = [
      [{ words: 0, withAudio: 0, withImage: 0, enriched: 0 }],
      [{ n: 0 }],
      [],
      [],
      [],
    ];
    const stats = await cmsStatsDb();
    expect(stats.cefrHistogram).toEqual({
      A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, untagged: 0, other: 0,
    });
    expect(stats.perSource).toEqual({});
    expect(stats.perBook).toEqual([]);
  });
});

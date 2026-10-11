import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * VocabStats (VU-43 SF-4 t2-t5) — repo KHÔNG có DOM-test infra (vitest node,
 * không jsdom/msw — không tự thêm dep) → test PURE legs: formatPercent (pin
 * 1 thập phân + 0 → "0%"), histogramRows/TOTAL (8 buckets đủ, tổng = tổng),
 * bookRowsDesc (sort words desc), fetchCmsStats (vitest fetch mock — {ok:true}
 * parse + {ok:false} → ApiError). UI render là e2e admin-vocabulary-stats.
 */
import {
  HISTOGRAM_ORDER,
  bookRowsDesc,
  fetchCmsStats,
  formatPercent,
  histogramRows,
  histogramTotal,
} from "./vocab-stats";
import type { CefrHistogram } from "@/lib/admin/cms-stats-store";

describe("formatPercent (pin context pack t2: 1 thập phân, 0 → 0%)", () => {
  it("0 → '0%' (kể cả mẫu số 0 — DB trống)", () => {
    expect(formatPercent(0, 100)).toBe("0%");
    expect(formatPercent(0, 0)).toBe("0%");
    expect(formatPercent(4, 0)).toBe("0%");
  });

  it("1 chữ số thập phân: 1/3 → 33.3%, 2/3 → 66.7%, làm tròn chuẩn", () => {
    expect(formatPercent(1, 3)).toBe("33.3%");
    expect(formatPercent(2, 3)).toBe("66.7%");
    expect(formatPercent(5714, 10000)).toBe("57.1%");
  });

  it("đầy đủ 100% → '100.0%'; phân số lẻ giữ 1 số lẻ", () => {
    expect(formatPercent(10, 10)).toBe("100.0%");
    expect(formatPercent(1, 8)).toBe("12.5%");
  });
});

describe("histogramRows / histogramTotal (pin §5.8)", () => {
  const full: CefrHistogram = {
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
    C1: 5,
    C2: 6,
    untagged: 7,
    other: 8,
  };

  it("đủ 8 buckets theo thứ tự A1..C2 + untagged + other (kể cả bucket 0)", () => {
    const rows = histogramRows({ A1: 5, B2: 2, untagged: 1, other: 0 } as CefrHistogram);
    expect(rows.map((r) => r.key)).toEqual([...HISTOGRAM_ORDER]);
    expect(rows.find((r) => r.key === "A2")?.count).toBe(0);
    expect(rows.find((r) => r.key === "A1")?.count).toBe(5);
  });

  it("tổng buckets = tổng words (data-histogram-total)", () => {
    expect(histogramTotal(full)).toBe(36);
    expect(histogramTotal({ ...full, A1: 0, untagged: 0, other: 0 })).toBe(20);
  });
});

describe("bookRowsDesc (t4 — sort theo số words desc)", () => {
  it("nhiều words lên đầu; giữ nguyên mảng gốc (bất biến)", () => {
    const original = [
      { bookId: 1, title: "Ít", words: 3, withAudio: 3 },
      { bookId: 2, title: "Nhiều", words: 50, withAudio: 10 },
      { bookId: 3, title: "Trung bình", words: 12, withAudio: 0 },
    ];
    const sorted = bookRowsDesc(original);
    expect(sorted.map((b) => b.title)).toEqual(["Nhiều", "Trung bình", "Ít"]);
    expect(original[0]?.title).toBe("Ít"); // không mutate input
  });

  it("bằng words → thứ tự ổn định (không đảo lung tung)", () => {
    const tie = [
      { bookId: 1, title: "A", words: 5, withAudio: 0 },
      { bookId: 2, title: "B", words: 5, withAudio: 0 },
    ];
    expect(bookRowsDesc(tie).map((b) => b.bookId)).toEqual([1, 2]);
  });
});

describe("fetchCmsStats (vitest fetch mock)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api/admin/vocabulary/stats → body khi {ok:true}", async () => {
    const body = {
      ok: true,
      totals: { words: 10, withAudio: 4, withImage: 2, orphan: 3, enriched: 6 },
      cefrHistogram: { A1: 1, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, untagged: 9, other: 0 },
      perSource: {},
      perBook: [],
      crawl: {
        counts: { pending: 0, parsed: 0, failed: 0, failedMaxAttempts: 0 },
        samples: [],
        lastRun: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    await expect(fetchCmsStats()).resolves.toEqual(body);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      "/api/admin/vocabulary/stats",
    );
  });

  it("{ok:false,error} → throw ApiError code (loading → error state)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, error: "generic" }), {
            status: 500,
          }),
      ),
    );
    await expect(fetchCmsStats()).rejects.toMatchObject({ code: "generic" });
  });
});

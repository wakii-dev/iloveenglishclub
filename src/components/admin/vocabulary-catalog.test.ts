import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * VocabularyCatalog (VU-43 SF-2 t2-t10) — repo KHÔNG có DOM-test infra
 * (vitest environment node, không jsdom/msw — không tự thêm dep) → test PURE
 * legs: buildCatalogParams (mỗi filter → params GET đúng), toggle CEFR,
 * aggregate report bulk (chunk >500), parse filename export, fetchCatalogPage
 * (vitest fetch mock). UI render là e2e admin-vocabulary-catalog.spec.ts.
 */
import {
  CATALOG_BULK_CHUNK,
  CATALOG_PAGE_SIZE,
  CatalogApiError,
  DEFAULT_FILTERS,
  aggregateAssignReports,
  aggregateDeleteApplies,
  aggregateDeleteDryRuns,
  aggregateTagReports,
  buildCatalogParams,
  fetchCatalogPage,
  parseExportFilename,
  toggleCefrFilter,
  totalPagesFor,
  type CatalogFilters,
} from "./vocabulary-catalog";
import { chunkIds } from "@/lib/admin/crawl-batch";

function filters(patch: Partial<CatalogFilters>): CatalogFilters {
  return { ...DEFAULT_FILTERS, ...patch };
}

describe("buildCatalogParams (t3 — mỗi filter → params GET đúng)", () => {
  it("default → chỉ sort/limit/offset (không param trống)", () => {
    const params = buildCatalogParams(DEFAULT_FILTERS, 0);
    expect(params.get("sort")).toBe("created");
    expect(params.get("limit")).toBe(String(CATALOG_PAGE_SIZE));
    expect(params.get("offset")).toBe("0");
    expect(params.get("q")).toBeNull();
    expect(params.get("cefr")).toBeNull();
    expect(params.get("source")).toBeNull();
    expect(params.get("audio")).toBeNull();
    expect(params.get("bookId")).toBeNull();
    expect(params.get("orphan")).toBeNull();
  });

  it("search q → param q; trang 2 → offset 50", () => {
    const params = buildCatalogParams(filters({ q: "táo xanh" }), 1);
    expect(params.get("q")).toBe("táo xanh");
    expect(params.get("offset")).toBe(String(CATALOG_PAGE_SIZE));
  });

  it("chips CEFR multi → csv A1→C2 (thứ tự ổn định)", () => {
    const params = buildCatalogParams(
      filters({ cefr: toggleCefrFilter(toggleCefrFilter([], "B1"), "A1") }),
      0,
    );
    expect(params.get("cefr")).toBe("A1,B1");
  });

  it("orphan=1 WIN khi conflict bookId — bookId KHÔNG set kèm (spec §4)", () => {
    const params = buildCatalogParams(
      filters({ orphan: true, bookId: 7 }),
      0,
    );
    expect(params.get("orphan")).toBe("1");
    expect(params.get("bookId")).toBeNull();
  });

  it("book select (không orphan) → bookId; source/audio chỉ khi chọn", () => {
    const params = buildCatalogParams(
      filters({ bookId: 3, source: "teacher", audio: "missing" }),
      0,
    );
    expect(params.get("bookId")).toBe("3");
    expect(params.get("source")).toBe("teacher");
    expect(params.get("audio")).toBe("missing");
    expect(params.get("orphan")).toBeNull();
  });

  it("sort word/cefr truyền đúng (cefr null CUỐI do server — store pin)", () => {
    expect(buildCatalogParams(filters({ sort: "word" }), 0).get("sort")).toBe(
      "word",
    );
    expect(buildCatalogParams(filters({ sort: "cefr" }), 0).get("sort")).toBe(
      "cefr",
    );
  });
});

describe("toggleCefrFilter (chips multi-select)", () => {
  it("thêm/bỏ cấp — bất biến, giữ A1→C2", () => {
    const withB1 = toggleCefrFilter([], "B1");
    expect(withB1).toEqual(["B1"]);
    const withA1 = toggleCefrFilter(withB1, "A1");
    expect(withA1).toEqual(["A1", "B1"]);
    expect(toggleCefrFilter(withA1, "B1")).toEqual(["A1"]);
    expect(withA1).toEqual(["A1", "B1"]); // gốc không đổi
  });
});

describe("totalPagesFor (pagination 50/page)", () => {
  it("0 → 1 trang; 50 → 1; 51 → 2", () => {
    expect(totalPagesFor(0)).toBe(1);
    expect(totalPagesFor(50)).toBe(1);
    expect(totalPagesFor(51)).toBe(2);
  });
});

describe("aggregate report bulk (chunk >500 chạy hết — không stop-mid)", () => {
  it("assign-books: cộng affected/skipped, gộp errors", () => {
    expect(
      aggregateAssignReports([
        { affected: 3, skipped: 1, errors: [] },
        { affected: 0, skipped: 2, errors: [{ wordId: 9, error: "generic" }] },
      ]),
    ).toEqual({
      affected: 3,
      skipped: 3,
      errors: [{ wordId: 9, error: "generic" }],
    });
  });

  it("tag-cefr + delete apply: cộng counters, gộp errors", () => {
    expect(
      aggregateTagReports([
        { affected: 2, errors: [] },
        { affected: 1, errors: [{ wordId: 5, error: "generic" }] },
      ]).affected,
    ).toBe(3);
    const apply = aggregateDeleteApplies([
      { affected: 2, progressAffected: 7, errors: [] },
      { affected: 1, progressAffected: 0, errors: [{ wordId: 8, error: "x" }] },
    ]);
    expect(apply).toEqual({
      affected: 3,
      progressAffected: 7,
      errors: [{ wordId: 8, error: "x" }],
    });
  });

  it("delete dry-run: cộng willDelete/progressAffected, gộp missing", () => {
    expect(
      aggregateDeleteDryRuns([
        { willDelete: 2, progressAffected: 5, missing: [99] },
        { willDelete: 1, progressAffected: 1, missing: [98] },
      ]),
    ).toEqual({ willDelete: 3, progressAffected: 6, missing: [99, 98] });
  });

  it("chunkIds cap 500 — 1201 ids → 3 chunk (500/500/201)", () => {
    const ids = Array.from({ length: 1201 }, (_, i) => i + 1);
    const chunks = chunkIds(ids, CATALOG_BULK_CHUNK);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 201]);
  });
});

describe("parseExportFilename (t9 — filename từ Content-Disposition)", () => {
  it("đọc filename quoted — pattern vocabulary-YYYY-MM-DD.csv", () => {
    expect(
      parseExportFilename('attachment; filename="vocabulary-2026-10-11.csv"'),
    ).toBe("vocabulary-2026-10-11.csv");
    expect(parseExportFilename(null)).toBeNull();
    expect(parseExportFilename("attachment")).toBeNull();
  });
});

describe("fetchCatalogPage (vitest fetch mock — không msw)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ok → {items,total}; URL = /api/admin/vocabulary?params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, items: [], total: 0 }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchCatalogPage("sort=created&limit=50&offset=0");
    expect(result).toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/vocabulary?sort=created&limit=50&offset=0",
      { signal: undefined },
    );
  });

  it("{ok:false,error} → CatalogApiError(error code) — UI map i18n", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "generic" }), {
          status: 500,
        }),
      ),
    );
    await expect(fetchCatalogPage("x=1")).rejects.toMatchObject({
      code: "generic",
    });
    await expect(
      fetchCatalogPage("x=1"),
    ).rejects.toBeInstanceOf(CatalogApiError);
  });

  it("body JSON hỏng → generic (không ném SyntaxError)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 })),
    );
    await expect(fetchCatalogPage("x=1")).rejects.toMatchObject({
      code: "generic",
    });
  });
});

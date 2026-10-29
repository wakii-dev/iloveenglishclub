import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CurationBrowser test legs (VU-43 SF-3) — repo không có DOM-test infra
 * (vitest environment node, không testing-library) → test PURE legs + data
 * functions với fetch STUB (không msw — pattern crawl specs); UI render là
 * của e2e admin-vocabulary-curation.spec.ts (pattern bulk-selection.test.ts).
 * Pin spec §2.2/§4/§5: COALESCE headword, querystring filter, chunk >200
 * aggregate không stop-mid, missing meaning chặn promote.
 */
import {
  aggregatePromoteReports,
  applyBackfill,
  buildEntriesQuery,
  fetchBackfillPlan,
  fetchEntries,
  headwordOf,
  missingMeanings,
  prettySlugFallback,
  PROMOTE_CHUNK_CAP,
  promoteChunked,
  type CurationEntry,
  type PromoteReport,
} from "./curation-browser";

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

function entry(partial: Partial<CurationEntry>): CurationEntry {
  return {
    id: 1,
    slug: "alpha",
    word: "alpha",
    ipaUk: null,
    ipaUs: null,
    cefr: null,
    pos: null,
    ox3000: false,
    audioUkBlob: null,
    audioUsBlob: null,
    hasWord: false,
    ...partial,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("headwordOf (COALESCE word, pretty slug — spec §2.2)", () => {
  it("word trim nguyên văn thắng; null/rỗng → pretty slug", () => {
    expect(headwordOf({ word: "  bank  ", slug: "bank_1" })).toBe("bank");
    expect(headwordOf({ word: null, slug: "tree" })).toBe("tree");
    expect(headwordOf({ word: "   ", slug: "qa-cms-x_3" })).toBe("qa cms x");
  });

  it("prettySlugFallback: strip _N + dash→space (mirror prettySlug server)", () => {
    expect(prettySlugFallback("tree_1")).toBe("tree");
    expect(prettySlugFallback("qa-cms-k3f9-alpha")).toBe("qa cms k3f9 alpha");
    expect(prettySlugFallback("book_12")).toBe("book");
  });
});

describe("buildEntriesQuery (filter bar → GET /crawl/entries)", () => {
  it("mặc định: status=parsed + limit 50 + offset 0, omit filter rỗng", () => {
    expect(buildEntriesQuery({
      status: "parsed", q: "", cefr: [], pos: "", ox3000: "all", offset: 0,
    })).toBe("status=parsed&limit=50&offset=0");
  });

  it("cefr csv + q/pos trim + ox3000 only → 1; offset luôn >= 0", () => {
    expect(buildEntriesQuery({
      status: "pending",
      q: "  qa-cms  ",
      cefr: ["A2", "B1"],
      pos: " noun ",
      ox3000: "only",
      offset: 50,
    })).toBe("status=pending&limit=50&offset=50&q=qa-cms&pos=noun&cefr=A2%2CB1&ox3000=1");
  });

  it("offset âm kẹp 0 (pagination guard)", () => {
    expect(buildEntriesQuery({
      status: "parsed", q: "", cefr: [], pos: "", ox3000: "all", offset: -50,
    })).toBe("status=parsed&limit=50&offset=0");
  });
});

describe("missingMeanings (grid — promote disabled khi còn thiếu)", () => {
  it("đếm id thiếu nghĩa; trim rỗng tính là thiếu; đủ → 0", () => {
    const meanings = { "1": "  cái  ", "2": "   ", "3": undefined as unknown as string };
    expect(missingMeanings([1, 2, 3, 4], meanings)).toBe(3);
    expect(missingMeanings([1], { "1": "cái" })).toBe(0);
  });
});

describe("aggregatePromoteReports (chunk >200 aggregate)", () => {
  it("cộng created/duplicates, nối failed; rỗng → zeros", () => {
    const a: PromoteReport = { created: 2, duplicates: 1, failed: [{ entryId: 9, error: "generic" }] };
    const b: PromoteReport = { created: 1, duplicates: 3, failed: [] };
    expect(aggregatePromoteReports([a, b])).toEqual({
      created: 3,
      duplicates: 4,
      failed: [{ entryId: 9, error: "generic" }],
    });
    expect(aggregatePromoteReports([])).toEqual({ created: 0, duplicates: 0, failed: [] });
  });
});

describe("promoteChunked (fetch mock — spec §5 cap 200/lượt)", () => {
  it("450 ids → 3 request (200/200/50), meanings đúng subset từng chunk, aggregate đúng", async () => {
    const bodies: { entryIds: number[]; bookId: number; meanings: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const ids = JSON.parse(String(init?.body)).entryIds as number[];
      // chunk 2: toàn duplicate (created=0 — batch không chết); chunk 3: 1 lỗi
      if (ids.length === 200 && bodies.length === 2) {
        return jsonResponse({ ok: true, report: { created: 0, duplicates: 200, failed: [] } });
      }
      if (bodies.length === 3) {
        return jsonResponse({
          ok: true,
          report: { created: ids.length - 1, duplicates: 0, failed: [{ entryId: ids[0]!, error: "meaningRequired" }] },
        });
      }
      return jsonResponse({ ok: true, report: { created: ids.length, duplicates: 0, failed: [] } });
    }));

    const entryIds = Array.from({ length: 450 }, (_, i) => i + 1);
    const meaningMap = Object.fromEntries(entryIds.map((id) => [String(id), `nghĩa ${id}`]));

    const report = await promoteChunked(entryIds, 7, meaningMap);

    expect(bodies).toHaveLength(3);
    expect(bodies[0]!.entryIds).toHaveLength(200);
    expect(bodies[1]!.entryIds).toHaveLength(200);
    expect(bodies[2]!.entryIds).toHaveLength(50);
    expect(bodies.every((b) => b.bookId === 7)).toBe(true);
    // meanings gửi ĐÚNG subset keys của chunk
    expect(Object.keys(bodies[0]!.meanings).sort()).toEqual(
      bodies[0]!.entryIds.map(String).sort(),
    );
    expect(bodies[2]!.meanings["450"]).toBe("nghĩa 450");
    expect(report).toEqual({
      created: 200 + 0 + 49,
      duplicates: 200,
      failed: [{ entryId: 401, error: "meaningRequired" }],
    });
  });

  it("chunk lỗi transport (500) → entries chunk đó vào failed, chunk sau VẪN chạy (không stop-mid)", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("boom", { status: 500 });
      return jsonResponse({ ok: true, report: { created: 1, duplicates: 0, failed: [] } });
    }));

    // 201 ids → 2 chunks (200 + 1): chunk 1 nổ transport, chunk 2 vẫn chạy
    const entryIds = Array.from({ length: 201 }, (_, i) => i + 1);
    const meanings = Object.fromEntries(entryIds.map((id) => [String(id), "nghĩa"]));

    const report = await promoteChunked(entryIds, 7, meanings);

    expect(report.created).toBe(1); // chunk 2 vẫn chạy
    expect(report.duplicates).toBe(0);
    expect(report.failed).toHaveLength(200); // mọi entry chunk 1
    expect(report.failed.every((f) => f.error === "generic")).toBe(true);
  });

  it("cap mặc định = 200 (PROMOTE_CAP server — pin spec §5.1)", () => {
    expect(PROMOTE_CHUNK_CAP).toBe(200);
  });
});

describe("fetchEntries (GET /crawl/entries)", () => {
  it("GET đúng URL query + parse items/total", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      jsonResponse({ ok: true, items: [entry({ id: 5, hasWord: true })], total: 63 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchEntries({
      status: "parsed", q: "qa-cms", cefr: ["A2"], pos: "", ox3000: "only", offset: 0,
    });

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("/api/admin/vocabulary/crawl/entries?");
    expect(url).toContain("status=parsed");
    expect(url).toContain("q=qa-cms");
    expect(url).toContain("cefr=A2");
    expect(url).toContain("ox3000=1");
    expect(url).toContain("limit=50");
    expect(data).toEqual({ items: [entry({ id: 5, hasWord: true })], total: 63 });
  });

  it("{ok:false,error} → throw ApiError (code map i18n phía UI)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: false, error: "generic" }, false)));
    await expect(fetchEntries({
      status: "parsed", q: "", cefr: [], pos: "", ox3000: "all", offset: 0,
    })).rejects.toMatchObject({ code: "generic" });
  });
});

describe("backfill (POST /audio-backfill — scope bookId bắt buộc)", () => {
  it("dry-run payload {scope:{bookId}, dryRun:true} → plan counts", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ scope: { bookId: 42 }, dryRun: true });
      return jsonResponse({ ok: true, plan: { matched: [{ wordId: 1, blobUrl: "b" }, { wordId: 2, blobUrl: "c" }], pending: 3, missing: [9] } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const plan = await fetchBackfillPlan(42);
    expect(plan).toEqual({ matchedCount: 2, pending: 3, missingCount: 1 });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/admin/vocabulary/audio-backfill");
  });

  it("apply payload dryRun:false + limit 200 → report counts", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ scope: { bookId: 42 }, dryRun: false, limit: 200 });
      return jsonResponse({ ok: true, report: { applied: 5, downloaded: 0, errors: [] } });
    }));

    expect(await applyBackfill(42)).toEqual({ applied: 5, downloaded: 0, errorCount: 0 });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/admin/vocabulary/export (VU-43 SF-1 task 7) — contract: assertAdmin;
 * filter params passthrough như GET list; >10k → {ok:false,error:'tooMany'}
 * (chặn trước khi fetch full); 0 rows → header-only; Content-Disposition
 * filename pattern; Content-Type text/csv utf-8.
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
const storeMock = vi.hoisted(() => ({ listVocabulary: vi.fn() }));
vi.mock("@/lib/admin/vocabulary-store", () => storeMock);

const { GET } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/vocabulary/export${query}`);
}

const csvRow = {
  id: 1,
  word: "apple",
  ipa: null,
  meaning_vi: "quả táo",
  example: null,
  audio_url: null,
  cefr: "A1",
  source: null,
  pos: null,
  image_url: null,
  synonyms: null,
  createdAt: new Date(),
  bookIds: [],
};

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.listVocabulary.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/vocabulary/export", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await GET(req(""));
    expect(res.status).toBe(403);
    expect(storeMock.listVocabulary).not.toHaveBeenCalled();
  });

  it("filter passthrough + count-chặn-trước: call 1 limit 1 (count), call 2 fetch full", async () => {
    storeMock.listVocabulary
      .mockResolvedValueOnce({ items: [], total: 2 })
      .mockResolvedValueOnce({ items: [csvRow, csvRow], total: 2 });
    const res = await GET(req("?cefr=b1&q=táo&orphan=1&sort=word"));
    expect(res.status).toBe(200);
    const first = storeMock.listVocabulary.mock.calls[0]?.[0];
    expect(first).toMatchObject({ cefr: ["B1"], q: "táo", orphan: true, sort: "word", limit: 1 });
    const second = storeMock.listVocabulary.mock.calls[1]?.[0];
    expect(second).toMatchObject({ limit: 2, offset: 0 });
    // BOM UTF-8 sống sót qua HTTP (text() consume BOM — check bytes EF BB BF)
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder("utf-8").decode(bytes.slice(3));
    expect(body.startsWith("word,ipa,meaning_vi")).toBe(true);
    expect(body).toContain("apple");
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="vocabulary-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });

  it(">10k rows → 400 {ok:false,error:'tooMany'}, chỉ gọi count (không fetch full)", async () => {
    storeMock.listVocabulary.mockResolvedValue({ items: [], total: 10001 });
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "tooMany" });
    expect(storeMock.listVocabulary).toHaveBeenCalledTimes(1);
  });

  it("0 kết quả → 200 CSV header-only", async () => {
    storeMock.listVocabulary
      .mockResolvedValueOnce({ items: [], total: 0 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    const res = await GET(req("?q=không-có"));
    expect(res.status).toBe(200);
    const body = await res.text(); // text() consume BOM → bắt đầu tại 'word'
    expect(body).toBe(
      "word,ipa,meaning_vi,example,cefr,source,pos,synonyms,audio_url,image_url",
    );
  });
});

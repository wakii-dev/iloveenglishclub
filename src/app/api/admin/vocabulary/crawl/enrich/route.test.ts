import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/crawl/enrich (VU-32 SF-2) — shape PIN context
 * pack §4: {bookId | wordIds[], dryRun?}; dryRun:true → counts; thiếu dryRun
 * → apply report per-word. assertAdmin MỌI method (401/403 trước logic);
 * cap 200 từ (vượt → 400 tooManyWords).
 */
const guardsMock = vi.hoisted(() => ({ assertAdmin: vi.fn() }));
// mock TOÀN PHẦN (không importOriginal — real module kéo @/auth→next-auth,
// không load được ngoài Next runtime). Route chỉ dùng ForbiddenError + assertAdmin.
vi.mock("@/lib/content/guards", () => {
  class ForbiddenError extends Error {
    constructor(message = "forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  }
  return { ForbiddenError, assertAdmin: guardsMock.assertAdmin };
});
const enrichMock = vi.hoisted(() => ({ enrichWordsDb: vi.fn() }));
vi.mock("@/lib/oxford/enrich", () => ({
  ENRICH_MAX_WORDS: 200,
  EnrichCapError: class EnrichCapError extends Error {},
  enrichWordsDb: enrichMock.enrichWordsDb,
}));

const { POST } = await import("./route");
// class mocked — dùng ĐÚNG instance để test mapping 400/401/403
const { EnrichCapError } = await import("@/lib/oxford/enrich");
const { ForbiddenError } = await import("@/lib/content/guards");

const URL = "http://localhost/api/admin/vocabulary/crawl/enrich";

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  enrichMock.enrichWordsDb.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/crawl/enrich — guards", () => {
  it.each([
    ["not-authenticated", 401],
    ["not-admin", 403],
  ])("assertAdmin %s → %d, không chạm lib", async (msg, status) => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError(msg));
    const res = await POST(post({ bookId: 1, dryRun: true }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error: msg });
    expect(enrichMock.enrichWordsDb).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/vocabulary/crawl/enrich — body validation", () => {
  it("body không phải JSON → 400 invalidJson", async () => {
    const res = await POST("không-phải-json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{}, "thiếu cả hai"],
    [{ bookId: 1, wordIds: [1] }, "có cả hai"],
    [{ bookId: 0 }, "bookId = 0"],
    [{ bookId: -1 }, "bookId âm"],
    [{ bookId: "x" }, "bookId không phải số"],
    [{ wordIds: [] }, "wordIds rỗng"],
    [{ wordIds: [1, "x"] }, "wordIds phần tử lệch"],
    [{ wordIds: [1, 0] }, "wordIds có 0"],
  ])("%s (%s) → 400 invalidBody", async (body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidBody" });
    expect(enrichMock.enrichWordsDb).not.toHaveBeenCalled();
  });

  it("wordIds > 200 → 400 tooManyWords (cap 200 — lib không gọi)", async () => {
    const ids = Array.from({ length: 201 }, (_, i) => i + 1);
    const res = await POST(post({ wordIds: ids }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "tooManyWords" });
    expect(enrichMock.enrichWordsDb).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/vocabulary/crawl/enrich — happy path", () => {
  it("dryRun:true → 200 {ok, counts...} shape pin", async () => {
    enrichMock.enrichWordsDb.mockResolvedValue({
      candidates: 5,
      fillableIpa: 3,
      fillableExample: 2,
      fillableCefr: 4,
      fillableAudio: 1,
    });
    const res = await POST(post({ bookId: 1, dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      candidates: 5,
      fillableIpa: 3,
      fillableExample: 2,
      fillableCefr: 4,
      fillableAudio: 1,
    });
    expect(enrichMock.enrichWordsDb).toHaveBeenCalledWith({ bookId: 1, dryRun: true });
  });

  it("wordIds + thiếu dryRun → apply (mặc định), report per-word", async () => {
    enrichMock.enrichWordsDb.mockResolvedValue([
      { word: "tree", filled: ["ipa"], skipped: [], reason: "noAudioBlob" },
      { word: "house", filled: [], skipped: ["ipa"], reason: "noMatch" },
    ]);
    const res = await POST(post({ wordIds: [1, 2] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      report: [
        { word: "tree", filled: ["ipa"], skipped: [], reason: "noAudioBlob" },
        { word: "house", filled: [], skipped: ["ipa"], reason: "noMatch" },
      ],
    });
    expect(enrichMock.enrichWordsDb).toHaveBeenCalledWith({ wordIds: [1, 2], dryRun: false });
  });

  it("EnrichCapError từ lib (book > 200 words) → 400 tooManyWords", async () => {
    enrichMock.enrichWordsDb.mockRejectedValue(new EnrichCapError(201));
    const res = await POST(post({ bookId: 1 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "tooManyWords" });
  });

  it("lỗi lạ → 500 generic (không lộ message)", async () => {
    enrichMock.enrichWordsDb.mockRejectedValue(new Error("boom-secret"));
    const res = await POST(post({ bookId: 1 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

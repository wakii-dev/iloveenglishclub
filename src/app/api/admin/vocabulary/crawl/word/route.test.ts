import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/crawl/word (VU-32 SF-2) — crawl-on-add preview.
 * Shape PIN: {found, from:'cache'|'live', entry:{slug,word,ipaUk,ipaUs,cefr,
 * pos,audioUkBlob,audioUsBlob}|null}. cache-first — trúng KHÔNG gọi Oxford.
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
const enrichMock = vi.hoisted(() => ({ previewWordDb: vi.fn() }));
vi.mock("@/lib/oxford/enrich", () => ({ previewWordDb: enrichMock.previewWordDb }));

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

const URL = "http://localhost/api/admin/vocabulary/crawl/word";

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const entryShape = {
  slug: "tree",
  word: "tree",
  ipaUk: "/triː/",
  ipaUs: "/triː/",
  cefr: "A1",
  pos: "noun",
  audioUkBlob: "https://blob.example/tree.uk.mp3",
  audioUsBlob: null,
};

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  enrichMock.previewWordDb.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/crawl/word — guards + validation", () => {
  it.each([
    ["not-authenticated", 401],
    ["not-admin", 403],
  ])("assertAdmin %s → %d, không chạm lib", async (msg, status) => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError(msg));
    const res = await POST(post({ word: "tree" }));
    expect(res.status).toBe(status);
    expect(enrichMock.previewWordDb).not.toHaveBeenCalled();
  });

  it.each([
    ["không-phải-json", "invalidJson"],
    [{}, "invalidWord"],
    [{ word: "" }, "invalidWord"],
    [{ word: "   " }, "invalidWord"],
    [{ word: 42 }, "invalidWord"],
    [{ word: "x".repeat(101) }, "invalidWord"],
    [{ word: "tree", bookId: 0 }, "invalidBookId"],
    [{ word: "tree", bookId: -3 }, "invalidBookId"],
    [{ word: "tree", bookId: "x" }, "invalidBookId"],
  ])("%s → 400 %s", async (body, error) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error });
    expect(enrichMock.previewWordDb).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/vocabulary/crawl/word — happy path", () => {
  it("cache trúng → 200 {found, from:'cache', entry} shape pin", async () => {
    enrichMock.previewWordDb.mockResolvedValue({
      found: true,
      from: "cache",
      entry: entryShape,
    });
    const res = await POST(post({ word: "tree", bookId: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      found: true,
      from: "cache",
      entry: entryShape,
    });
    expect(enrichMock.previewWordDb).toHaveBeenCalledWith("tree");
  });

  it("miss → {found:false, from:'live', entry:null}", async () => {
    enrichMock.previewWordDb.mockResolvedValue({ found: false, from: "live", entry: null });
    const res = await POST(post({ word: "zzz" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, found: false, from: "live", entry: null });
  });

  it("live fetch lỗi (SSRF/network qua fetchEntry SF-1) → 502 liveFetchFailed", async () => {
    enrichMock.previewWordDb.mockRejectedValue(new Error("timeout"));
    const res = await POST(post({ word: "tree" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "liveFetchFailed" });
  });

  it("lỗi lạ → 500 generic", async () => {
    enrichMock.previewWordDb.mockRejectedValue({ code: "weird" }); // non-Error
    const res = await POST(post({ word: "tree" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

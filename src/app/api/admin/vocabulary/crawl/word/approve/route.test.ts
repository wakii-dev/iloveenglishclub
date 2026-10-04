import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/crawl/word/approve (VU-32 SF-2) — crawl-on-add
 * duyệt: entry (payload y như preview) + meaning_vi (teacher gõ, BẮT BUỘC)
 * + bookId → tạo word + link book + cefr + source='oxford-ld'; duplicate →
 * reuse + attach + vẫn set; audio tải fail → word VẪN tạo KHÔNG audio.
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
const enrichMock = vi.hoisted(() => ({ approveWordDb: vi.fn() }));
vi.mock("@/lib/oxford/enrich", () => ({ approveWordDb: enrichMock.approveWordDb }));

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

const URL = "http://localhost/api/admin/vocabulary/crawl/word/approve";

const okEntry = {
  slug: "tree",
  word: "tree",
  ipaUk: "/triː/",
  ipaUs: null,
  cefr: "A1",
  pos: "noun",
  audioUkBlob: null,
  audioUsBlob: null,
};

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  enrichMock.approveWordDb.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/crawl/word/approve — guards + validation", () => {
  it.each([
    ["not-authenticated", 401],
    ["not-admin", 403],
  ])("assertAdmin %s → %d, không chạm lib", async (msg, status) => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError(msg));
    const res = await POST(post({ entry: okEntry, meaning_vi: "cây", bookId: 1 }));
    expect(res.status).toBe(status);
    expect(enrichMock.approveWordDb).not.toHaveBeenCalled();
  });

  it.each([
    ["không-phải-json", "invalidJson"],
    [{ meaning_vi: "cây", bookId: 1 }, "invalidEntry"], // thiếu entry
    [{ entry: "tree", meaning_vi: "cây", bookId: 1 }, "invalidEntry"],
    [{ entry: { ...okEntry, word: "" }, meaning_vi: "cây", bookId: 1 }, "invalidEntry"],
    [{ entry: { ...okEntry, slug: "" }, meaning_vi: "cây", bookId: 1 }, "invalidEntry"],
    [{ entry: okEntry, bookId: 1 }, "meaningRequired"], // thiếu meaning_vi
    [{ entry: okEntry, meaning_vi: "   ", bookId: 1 }, "meaningRequired"],
    [{ entry: okEntry, meaning_vi: 42, bookId: 1 }, "meaningRequired"],
    [
      { entry: okEntry, meaning_vi: "x".repeat(501), bookId: 1 },
      "meaningTooLong",
    ],
    [{ entry: okEntry, meaning_vi: "cây" }, "invalidBookId"], // thiếu bookId
    [{ entry: okEntry, meaning_vi: "cây", bookId: 0 }, "invalidBookId"],
    [{ entry: okEntry, meaning_vi: "cây", bookId: -1 }, "invalidBookId"],
  ])("%s → 400 %s", async (body, error) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error });
    expect(enrichMock.approveWordDb).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/vocabulary/crawl/word/approve — happy path", () => {
  it("word mới → 201 {ok, id, duplicate:false, audioAttached}", async () => {
    enrichMock.approveWordDb.mockResolvedValue({
      ok: true,
      id: 21,
      duplicate: false,
      audioAttached: true,
    });
    const res = await POST(post({ entry: okEntry, meaning_vi: "cây", bookId: 1 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      ok: true,
      id: 21,
      duplicate: false,
      audioAttached: true,
    });
    expect(enrichMock.approveWordDb).toHaveBeenCalledWith({
      entry: okEntry,
      meaningVi: "cây",
      bookId: 1,
    });
  });

  it("word đã tồn tại (reuse) → 200 duplicate:true (idempotent)", async () => {
    enrichMock.approveWordDb.mockResolvedValue({
      ok: true,
      id: 21,
      duplicate: true,
      audioAttached: false,
    });
    const res = await POST(post({ entry: okEntry, meaning_vi: "cây", bookId: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, duplicate: true });
  });

  it("bookNotFound → 400", async () => {
    enrichMock.approveWordDb.mockResolvedValue({ ok: false, error: "bookNotFound" });
    const res = await POST(post({ entry: okEntry, meaning_vi: "cây", bookId: 99 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("lỗi lạ → 500 generic", async () => {
    enrichMock.approveWordDb.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ entry: okEntry, meaning_vi: "cây", bookId: 1 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

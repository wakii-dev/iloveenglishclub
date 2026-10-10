import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/crawl/promote (VU-43 SF-1 task 11) — cap 200 →
 * tooMany; meanings thiếu 1 entry → meaningRequired TRƯỚC mutation nào
 * (store không được gọi); store tự advisory lock + revalidate.
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
const storeMock = vi.hoisted(() => ({
  PROMOTE_CAP: 200,
  promoteCrawlEntries: vi.fn(),
}));
vi.mock("@/lib/admin/promote-store", () => storeMock);

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/vocabulary/crawl/promote", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.promoteCrawlEntries.mockReset().mockResolvedValue({
    ok: true,
    report: { created: 2, duplicates: 0, failed: [] },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/crawl/promote", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await POST(
      req({ entryIds: [1], bookId: 7, meanings: { "1": "nghĩa" } }),
    );
    expect(res.status).toBe(403);
    expect(storeMock.promoteCrawlEntries).not.toHaveBeenCalled();
  });

  it("meanings thiếu 1 entry (rỗng/sai kiểu/không có key) → 400 meaningRequired, store KHÔNG gọi", async () => {
    for (const meanings of [
      {},
      { "1": "  " },
      { "1": "ok", "2": 42 },
      { "1": "ok", "2": "" },
    ]) {
      const res = await POST(
        req({ entryIds: [1, 2], bookId: 7, meanings }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "meaningRequired" });
    }
    expect(storeMock.promoteCrawlEntries).not.toHaveBeenCalled();
  });

  it("cap 200 → tooMany; entryIds/bookId sai shape → 400; shape hợp lệ → report passthrough", async () => {
    const many = Array.from({ length: 201 }, (_, i) => i + 1);
    const over = await POST(
      req({
        entryIds: many,
        bookId: 7,
        meanings: Object.fromEntries(many.map((id) => [String(id), "nghĩa"])),
      }),
    );
    expect(await over.json()).toEqual({ ok: false, error: "tooMany" });

    const bad = await POST(req({ entryIds: "x", bookId: 7, meanings: { "1": "n" } }));
    expect(await bad.json()).toEqual({ ok: false, error: "invalidEntryIds" });
    const noBook = await POST(req({ entryIds: [1], bookId: 0, meanings: { "1": "n" } }));
    expect(await noBook.json()).toEqual({ ok: false, error: "invalidBookId" });

    const ok = await POST(
      req({ entryIds: [1, 2], bookId: 7, meanings: { "1": "a", "2": "b" } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      report: { created: 2, duplicates: 0, failed: [] },
    });
    expect(storeMock.promoteCrawlEntries).toHaveBeenCalledWith(
      [1, 2],
      7,
      expect.objectContaining({ "1": "a" }),
    );
  });

  it("bookNotFound → 400; lỗi lib → 500 generic", async () => {
    storeMock.promoteCrawlEntries.mockResolvedValue({ ok: false, error: "bookNotFound" });
    const notFound = await POST(
      req({ entryIds: [1], bookId: 99, meanings: { "1": "nghĩa" } }),
    );
    expect(await notFound.json()).toEqual({ ok: false, error: "bookNotFound" });

    storeMock.promoteCrawlEntries.mockRejectedValue(new Error("boom"));
    const boom = await POST(
      req({ entryIds: [1], bookId: 7, meanings: { "1": "nghĩa" } }),
    );
    expect(boom.status).toBe(500);
    expect(await boom.json()).toEqual({ ok: false, error: "generic" });
  });
});

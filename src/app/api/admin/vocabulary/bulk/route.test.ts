import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/bulk (VU-43 SF-1) — contract: assertAdmin;
 * cap 500 → tooMany; action không hợp lệ → invalidAction; delete dryRun vs
 * apply; tag-cefr validate cefr; assign-books 23503 → bookNotFound; store
 * tự revalidate (route không đụng revalidate).
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
  BULK_CAP: 500,
  bulkAssignBooks: vi.fn(),
  bulkTagCefr: vi.fn(),
  bulkDeleteDryRun: vi.fn(),
  bulkDeleteApply: vi.fn(),
}));
vi.mock("@/lib/admin/cms-bulk-store", () => storeMock);

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/vocabulary/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.bulkAssignBooks.mockReset().mockResolvedValue({ ok: true, report: { affected: 1, skipped: 0, errors: [] } });
  storeMock.bulkTagCefr.mockReset().mockResolvedValue({ affected: 1, errors: [] });
  storeMock.bulkDeleteDryRun.mockReset().mockResolvedValue({ willDelete: 1, progressAffected: 2, missing: [] });
  storeMock.bulkDeleteApply.mockReset().mockResolvedValue({ affected: 1, progressAffected: 2, errors: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/bulk", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await POST(req({ action: "delete", wordIds: [1] }));
    expect(res.status).toBe(403);
    expect(storeMock.bulkDeleteApply).not.toHaveBeenCalled();
  });

  it("wordIds > 500 → tooMany (không chạm store); wordIds sai shape → invalidWordIds", async () => {
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    const res = await POST(req({ action: "delete", wordIds: many }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "tooMany" });

    const bad = await POST(req({ action: "delete", wordIds: ["x"] }));
    expect(await bad.json()).toEqual({ ok: false, error: "invalidWordIds" });
    expect(storeMock.bulkDeleteApply).not.toHaveBeenCalled();
  });

  it("action lạ → invalidAction", async () => {
    const res = await POST(req({ action: "reindex", wordIds: [1] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidAction" });
  });

  it("assign-books: report bọc {ok:true, report}; bookIds thiếu → invalidBookIds", async () => {
    const res = await POST(req({ action: "assign-books", wordIds: [1, 2], bookIds: [7] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      report: { affected: 1, skipped: 0, errors: [] },
    });
    expect(storeMock.bulkAssignBooks).toHaveBeenCalledWith([1, 2], [7]);

    const noBook = await POST(req({ action: "assign-books", wordIds: [1] }));
    expect(await noBook.json()).toEqual({ ok: false, error: "invalidBookIds" });
  });

  it("assign-books bookNotFound → 400 mã bookNotFound", async () => {
    storeMock.bulkAssignBooks.mockResolvedValue({ ok: false, error: "bookNotFound" });
    const res = await POST(req({ action: "assign-books", wordIds: [1], bookIds: [99] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("tag-cefr: cefr normalize; cefr sai/thiếu → invalidCefr", async () => {
    const res = await POST(req({ action: "tag-cefr", wordIds: [1], cefr: " b2 " }));
    expect(res.status).toBe(200);
    expect(storeMock.bulkTagCefr).toHaveBeenCalledWith([1], "B2");

    const bad = await POST(req({ action: "tag-cefr", wordIds: [1], cefr: "Z9" }));
    expect(await bad.json()).toEqual({ ok: false, error: "invalidCefr" });
    const missing = await POST(req({ action: "tag-cefr", wordIds: [1] }));
    expect(await missing.json()).toEqual({ ok: false, error: "invalidCefr" });
  });

  it("delete dryRun:true → bulkDeleteDryRun (KHÔNG xoá); thiếu dryRun → apply", async () => {
    await POST(req({ action: "delete", wordIds: [1, 2], dryRun: true }));
    expect(storeMock.bulkDeleteDryRun).toHaveBeenCalledWith([1, 2]);
    expect(storeMock.bulkDeleteApply).not.toHaveBeenCalled();

    await POST(req({ action: "delete", wordIds: [1, 2] }));
    expect(storeMock.bulkDeleteApply).toHaveBeenCalledWith([1, 2]);
  });
});

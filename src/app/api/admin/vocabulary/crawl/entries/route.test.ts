import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/admin/vocabulary/crawl/entries (VU-43 SF-1 task 10) — contract:
 * assertAdmin; status default parsed; cefr csv normalize; ox3000 '1'/'0'/thiếu;
 * limit/offset clamp; lỗi lib → 500 generic.
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
const storeMock = vi.hoisted(() => ({ listCrawlEntries: vi.fn() }));
vi.mock("@/lib/admin/crawl-entries-store", () => storeMock);

const { GET } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/admin/vocabulary/crawl/entries${query}`);
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.listCrawlEntries.mockReset().mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/vocabulary/crawl/entries", () => {
  it("thiếu admin → 401/403, không chạm store", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(storeMock.listCrawlEntries).not.toHaveBeenCalled();
  });

  it("defaults: status parsed, limit 50, offset 0, không filter", async () => {
    await GET(req());
    expect(storeMock.listCrawlEntries).toHaveBeenCalledWith({
      status: "parsed",
      q: undefined,
      cefr: [],
      pos: undefined,
      ox3000: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it("params: status/cefr csv/pos/ox3000/limit/offset passthrough (lạ → default)", async () => {
    await GET(req("?status=failed&q=bank&cefr=b1,a2&pos=noun&ox3000=1&limit=999&offset=50"));
    expect(storeMock.listCrawlEntries).toHaveBeenCalledWith({
      status: "failed",
      q: "bank",
      cefr: ["B1", "A2"],
      pos: "noun",
      ox3000: true,
      limit: 200, // clamp max 200
      offset: 50,
    });
    await GET(req("?ox3000=0"));
    expect(storeMock.listCrawlEntries.mock.calls[1]?.[0]).toMatchObject({ ox3000: false });
  });

  it("lỗi lib → 500 generic", async () => {
    storeMock.listCrawlEntries.mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

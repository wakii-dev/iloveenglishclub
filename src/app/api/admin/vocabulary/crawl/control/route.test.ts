import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/crawl/control (VU-32 SF-2) — control-plane:
 * refresh-sitemap (diff + delta cap 2000) | retry-failed (cap attempts 5).
 * Runner là script ngoài — API KHÔNG chạy crawl. assertAdmin MỌI method.
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
const enrichMock = vi.hoisted(() => ({
  refreshSitemapDb: vi.fn(),
  retryFailedDb: vi.fn(),
}));
vi.mock("@/lib/oxford/enrich", () => ({
  refreshSitemapDb: enrichMock.refreshSitemapDb,
  retryFailedDb: enrichMock.retryFailedDb,
}));

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

const URL = "http://localhost/api/admin/vocabulary/crawl/control";

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  enrichMock.refreshSitemapDb.mockReset();
  enrichMock.retryFailedDb.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/crawl/control — guards + validation", () => {
  it.each([
    ["not-authenticated", 401],
    ["not-admin", 403],
  ])("assertAdmin %s → %d, không chạm lib", async (msg, status) => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError(msg));
    const res = await POST(post({ action: "retry-failed" }));
    expect(res.status).toBe(status);
    expect(enrichMock.retryFailedDb).not.toHaveBeenCalled();
  });

  it.each([
    ["không-phải-json", 400, "invalidJson"],
    [{}, 400, "invalidAction"],
    [{ action: "run-crawl" }, 400, "invalidAction"],
    [{ action: "refresh" }, 400, "invalidAction"],
  ])("%s → %d %s", async (body, status, error) => {
    const res = await POST(post(body));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error });
    expect(enrichMock.refreshSitemapDb).not.toHaveBeenCalled();
    expect(enrichMock.retryFailedDb).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/vocabulary/crawl/control — refresh-sitemap", () => {
  it("delta vừa phải → {ok, inserted}", async () => {
    enrichMock.refreshSitemapDb.mockResolvedValue({ inserted: 12 });
    const res = await POST(post({ action: "refresh-sitemap" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, inserted: 12 });
  });

  it("delta > 2000 → {ok, deltaTooLarge:true, delta, hint} (shape pin)", async () => {
    enrichMock.refreshSitemapDb.mockResolvedValue({
      deltaTooLarge: true,
      delta: 2001,
      hint: "chạy runner enumerate --apply",
    });
    const res = await POST(post({ action: "refresh-sitemap" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deltaTooLarge: true,
      delta: 2001,
      hint: "chạy runner enumerate --apply",
    });
  });

  it("sitemap fetch lỗi (SF-1 lib throw) → 502 sitemapFetchFailed", async () => {
    enrichMock.refreshSitemapDb.mockRejectedValue(new Error("HTTP 500 — sitemap.xml"));
    const res = await POST(post({ action: "refresh-sitemap" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "sitemapFetchFailed" });
  });
});

describe("POST /api/admin/vocabulary/crawl/control — retry-failed", () => {
  it("→ {ok, reset}", async () => {
    enrichMock.retryFailedDb.mockResolvedValue({ reset: 7 });
    const res = await POST(post({ action: "retry-failed" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reset: 7 });
    expect(enrichMock.retryFailedDb).toHaveBeenCalledTimes(1);
  });

  it("lỗi DB → 500 generic", async () => {
    enrichMock.retryFailedDb.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ action: "retry-failed" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

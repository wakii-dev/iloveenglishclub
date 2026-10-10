import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/admin/vocabulary/audio-backfill (VU-43 SF-1 task 9) — scope BẮT
 * BUỘC → scopeRequired (thiếu/sai shape); dryRun → plan; apply → report;
 * assertAdmin; lỗi lib → 500 generic. storage-server KHÔNG được import lúc
 * dry-run (dual-driver chỉ cần khi apply download).
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
  BACKFILL_APPLY_CAP: 200,
  planAudioBackfill: vi.fn(),
  applyAudioBackfill: vi.fn(),
}));
vi.mock("@/lib/admin/audio-backfill", () => storeMock);
const putAudioMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/storage-server", () => ({ putAudio: putAudioMock }));

const { POST } = await import("./route");
const { ForbiddenError } = await import("@/lib/content/guards");

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/vocabulary/audio-backfill", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  guardsMock.assertAdmin.mockReset().mockResolvedValue(undefined);
  storeMock.planAudioBackfill.mockReset().mockResolvedValue({ matched: [], pending: 0, missing: [] });
  storeMock.applyAudioBackfill.mockReset().mockResolvedValue({ applied: 0, downloaded: 0, errors: [] });
  putAudioMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/vocabulary/audio-backfill", () => {
  it("thiếu admin → 401/403", async () => {
    guardsMock.assertAdmin.mockRejectedValue(new ForbiddenError("not-admin"));
    const res = await POST(req({ scope: { bookId: 1 }, dryRun: true }));
    expect(res.status).toBe(403);
    expect(storeMock.planAudioBackfill).not.toHaveBeenCalled();
  });

  it("scope thiếu / sai shape / rỗng → 400 scopeRequired (spec pin)", async () => {
    for (const body of [
      { dryRun: true },
      { scope: null, dryRun: true },
      { scope: {}, dryRun: true },
      { scope: { wordIds: [] }, dryRun: true },
      { scope: { bookId: 0 }, dryRun: true },
      { scope: { wordIds: ["x"] }, dryRun: true },
    ]) {
      const res = await POST(req(body));
      expect(await res.json()).toEqual({ ok: false, error: "scopeRequired" });
    }
    expect(storeMock.planAudioBackfill).not.toHaveBeenCalled();
  });

  it("dryRun:true → plan passthrough; wordIds scope accept", async () => {
    storeMock.planAudioBackfill.mockResolvedValue({
      matched: [{ wordId: 1, blobUrl: "https://b/x.mp3" }],
      pending: 2,
      missing: [3],
    });
    const res = await POST(req({ scope: { wordIds: [1, 2, 3] }, dryRun: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      plan: { matched: [{ wordId: 1, blobUrl: "https://b/x.mp3" }], pending: 2, missing: [3] },
    });
    expect(storeMock.planAudioBackfill).toHaveBeenCalledWith({ wordIds: [1, 2, 3] }, 200);
    expect(putAudioMock).not.toHaveBeenCalled();
  });

  it("apply → report; limit clamp ≤200; allowDownload passthrough", async () => {
    const res = await POST(
      req({ scope: { bookId: 7 }, dryRun: false, limit: 999, allowDownload: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, report: { applied: 0, downloaded: 0, errors: [] } });
    const call = storeMock.applyAudioBackfill.mock.calls[0];
    expect(call?.[0]).toEqual({ bookId: 7 });
    expect(call?.[1]).toMatchObject({ limit: 200, allowDownload: true });
    expect(typeof call?.[1]?.deps?.download).toBe("function");
    expect(typeof call?.[1]?.deps?.put).toBe("function");
  });

  it("lỗi lib → 500 generic", async () => {
    storeMock.planAudioBackfill.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ scope: { bookId: 1 }, dryRun: true }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

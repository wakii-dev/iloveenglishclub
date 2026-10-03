import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/vocabulary/review route contract (SF-3 t-3.3) — mock @/auth + store.
 * Auth: chưa đăng nhập → 401 JSON (fetch client, KHÔNG redirect); validate
 * body: invalidJson / invalidWordId / invalidQuality → 400; wordNotFound →
 * 404; thành công → 200 kèm progress SRS.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const applyReviewMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vocabulary/review-store", () => ({ applyReview: applyReviewMock }));

const { POST } = await import("./route");

const URL = "http://localhost/api/vocabulary/review";

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  applyReviewMock.mockReset();
});

afterEach(() => {
  authState.session = null;
});

describe("POST /api/vocabulary/review", () => {
  it("chưa đăng nhập → 401 not-authenticated, không đụng store", async () => {
    authState.session = null;
    const res = await POST(post({ word_id: 1, quality: 4 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(applyReviewMock).not.toHaveBeenCalled();
  });

  it("body không phải JSON → 400 invalidJson", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post("khong-phai-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{ quality: 4 }, "invalidWordId"], // thiếu word_id
    [{ word_id: 0, quality: 4 }, "invalidWordId"],
    [{ word_id: -3, quality: 4 }, "invalidWordId"],
    [{ word_id: "abc", quality: 4 }, "invalidWordId"],
    [{ word_id: 1.5, quality: 4 }, "invalidWordId"],
    [{ word_id: 7 }, "invalidQuality"], // thiếu quality
    [{ word_id: 7, quality: -1 }, "invalidQuality"],
    [{ word_id: 7, quality: 6 }, "invalidQuality"],
    [{ word_id: 7, quality: 3.5 }, "invalidQuality"],
  ])("body %j → 400 %s", async (body, err) => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: err });
    expect(applyReviewMock).not.toHaveBeenCalled();
  });

  it("đăng nhập + body hợp lệ → store nhận (userId, wordId, quality), 200 kèm progress", async () => {
    authState.session = { user: { id: "u1" } };
    applyReviewMock.mockResolvedValue({
      ok: true,
      progress: { ease: 2.5, intervalDays: 1, reps: 1, dueAt: new Date() },
    });
    const res = await POST(post({ word_id: 7, quality: 4 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.progress).toMatchObject({ ease: 2.5, intervalDays: 1, reps: 1 });
    expect(applyReviewMock).toHaveBeenCalledWith("u1", 7, 4);
  });

  it("wordNotFound → 404", async () => {
    authState.session = { user: { id: "u1" } };
    applyReviewMock.mockResolvedValue({ ok: false, error: "wordNotFound" });
    const res = await POST(post({ word_id: 999, quality: 4 }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "wordNotFound" });
  });

  it("store ném lỗi lạ → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authState.session = { user: { id: "u1" } };
    applyReviewMock.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ word_id: 7, quality: 4 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

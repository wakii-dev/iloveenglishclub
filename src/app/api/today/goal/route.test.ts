import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PATCH|POST /api/today/goal route contract (daily-journey SF-2, VU-50 —
 * spec §3.3) — mock @/auth + store (pattern /api/vocabulary/goal route.test).
 * Body { minutes } nguyên 5..120 — taxonomy mirror: 401 not-authenticated ·
 * 400 invalidJson/invalidMinutes · 500 generic. PATCH + POST cùng handler.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const updateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/today/today-store", () => ({
  updateDailyGoalMinutes: updateMock,
}));

const { PATCH, POST } = await import("./route");

const URL = "http://localhost/api/today/goal";

function req(method: string, body: unknown): NextRequest {
  return new NextRequest(URL, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  updateMock.mockReset();
});

afterEach(() => {
  authState.session = null;
});

describe.each([
  ["PATCH", PATCH],
  ["POST", POST],
] as const)("%s /api/today/goal", (_method, handler) => {
  it("chưa đăng nhập → 401 not-authenticated, không đụng store", async () => {
    authState.session = null;
    const res = await handler(req("PATCH", { minutes: 15 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("body không phải JSON → 400 invalidJson", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await handler(req("PATCH", "khong-phai-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{}], // thiếu minutes
    [{ minutes: 4 }], // dưới 5
    [{ minutes: 0 }],
    [{ minutes: -15 }],
    [{ minutes: 121 }], // trên 120
    [{ minutes: "abc" }],
    [{ minutes: 7.5 }], // không nguyên
  ])("body %j → 400 invalidMinutes (integer 5..120)", async (body) => {
    authState.session = { user: { id: "u1" } };
    const res = await handler(req("PATCH", body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidMinutes" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([5, 15, 30, 120])(
    "minutes %i hợp lệ → store nhận (u1, minutes), 200 { ok, dailyGoalMinutes }",
    async (minutes) => {
      authState.session = { user: { id: "u1" } };
      updateMock.mockResolvedValue({ ok: true, dailyGoalMinutes: minutes });
      const res = await handler(req("PATCH", { minutes }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dailyGoalMinutes: minutes });
      expect(updateMock).toHaveBeenCalledWith("u1", minutes);
    },
  );

  it("store trả {ok:false} (profile mất) → 500 generic", async () => {
    authState.session = { user: { id: "u1" } };
    updateMock.mockResolvedValue({ ok: false });
    const res = await handler(req("PATCH", { minutes: 15 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });

  it("store lỗi → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authState.session = { user: { id: "u1" } };
    updateMock.mockRejectedValue(new Error("boom"));
    const res = await handler(req("PATCH", { minutes: 15 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

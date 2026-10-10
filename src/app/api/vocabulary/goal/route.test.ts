import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PATCH|POST /api/vocabulary/goal route contract (vocab-memrise SF-4, VU-41 —
 * context pack mục 8) — mock @/auth + store (pattern study-book route.test).
 * Auth: chưa đăng nhập → 401 not-authenticated; body { goal } nguyên 1..100
 * (chốt "free 1..100" — presets 5/10/20 là bề mặt UI) nếu không → 400
 * invalidGoal; update OK → 200 { ok, dailyGoalWords }; store lỗi → 500 generic.
 * PATCH + POST cùng handler (presets popover PATCH; POST dự phòng form).
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const updateMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vocabulary/dashboard-store", () => ({
  updateDailyGoal: updateMock,
}));

const { PATCH, POST } = await import("./route");

const URL = "http://localhost/api/vocabulary/goal";

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
] as const)("%s /api/vocabulary/goal", (_method, handler) => {
  it("chưa đăng nhập → 401 not-authenticated, không đụng store", async () => {
    authState.session = null;
    const res = await handler(req("PATCH", { goal: 10 }));
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
    [{}], // thiếu goal
    [{ goal: 0 }],
    [{ goal: -5 }],
    [{ goal: 101 }],
    [{ goal: "abc" }],
    [{ goal: 7.5 }],
  ])("body %j → 400 invalidGoal (integer 1..100)", async (body) => {
    authState.session = { user: { id: "u1" } };
    const res = await handler(req("PATCH", body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidGoal" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it.each([1, 5, 10, 20, 100])(
    "goal %i hợp lệ → store nhận (u1, goal), 200 { ok, dailyGoalWords }",
    async (goal) => {
      authState.session = { user: { id: "u1" } };
      updateMock.mockResolvedValue({ ok: true, dailyGoalWords: goal });
      const res = await handler(req("PATCH", { goal }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, dailyGoalWords: goal });
      expect(updateMock).toHaveBeenCalledWith("u1", goal);
    },
  );

  it("store lỗi → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authState.session = { user: { id: "u1" } };
    updateMock.mockRejectedValue(new Error("boom"));
    const res = await handler(req("PATCH", { goal: 10 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

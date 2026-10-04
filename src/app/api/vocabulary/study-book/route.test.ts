import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * POST /api/vocabulary/study-book route contract (story vocabulary-learn
 * t-1.2) — mock @/auth + store (pattern review route.test.ts). Auth: chưa
 * đăng nhập → 401 JSON; body { book_id } nguyên > 0 nếu không → 400
 * invalidBookId; seed OK → 200 { added, total }; store ném lỗi → 500 generic.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const seedMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vocabulary/study-store", () => ({
  seedBookProgress: seedMock,
}));

const { POST } = await import("./route");

const URL = "http://localhost/api/vocabulary/study-book";

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  seedMock.mockReset();
});

afterEach(() => {
  authState.session = null;
});

describe("POST /api/vocabulary/study-book", () => {
  it("chưa đăng nhập → 401 not-authenticated, không đụng store", async () => {
    authState.session = null;
    const res = await POST(post({ book_id: 5 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("body không phải JSON → 400 invalidJson", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post("khong-phai-json{"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{}], // thiếu book_id
    [{ book_id: 0 }],
    [{ book_id: -5 }],
    [{ book_id: "abc" }],
    [{ book_id: 1.5 }],
  ])("body %j → 400 invalidBookId", async (body) => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidBookId" });
    expect(seedMock).not.toHaveBeenCalled();
  });

  it("đăng nhập + body hợp lệ → store nhận (userId, bookId), 200 { added, total }", async () => {
    authState.session = { user: { id: "u1" } };
    seedMock.mockResolvedValue({ added: 7, total: 7 });
    const res = await POST(post({ book_id: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, added: 7, total: 7 });
    expect(seedMock).toHaveBeenCalledWith("u1", 5);
  });

  it("book đã học hết (added 0) → vẫn 200 (idempotent, không 4xx)", async () => {
    authState.session = { user: { id: "u1" } };
    seedMock.mockResolvedValue({ added: 0, total: 12 });
    const res = await POST(post({ book_id: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, added: 0, total: 12 });
  });

  it("store ném lỗi lạ → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authState.session = { user: { id: "u1" } };
    seedMock.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ book_id: 5 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

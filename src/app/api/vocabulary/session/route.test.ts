import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/vocabulary/session route contract (SF-2, VU-39 — spec §5) — mock
 * @/auth + store (pattern review/route.test.ts). Taxonomy: 401
 * not-authenticated · 400 invalidKind|invalidBook|invalidSession|invalidStep|
 * invalidResponse (+invalidJson kế thừa) · 404 sessionNotFound|wordNotFound ·
 * success-rỗng = 200 {ok, steps:[]} (không 204). GET không nhận sessionKey —
 * POST validate chặt từng field trước khi đụng store.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const getLearnMock = vi.hoisted(() => vi.fn());
const getReviewMock = vi.hoisted(() => vi.fn());
const applyStepMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vocabulary/learn-session-store", () => ({
  getLearnSession: getLearnMock,
  getReviewSession: getReviewMock,
  applyStep: applyStepMock,
}));

const { GET, POST } = await import("./route");

const URL = "http://localhost/api/vocabulary/session";

function get(query: string): NextRequest {
  return new NextRequest(`${URL}?${query}`);
}

function post(body: unknown): NextRequest {
  return new NextRequest(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  sessionKey: "sk-1",
  kind: "learn",
  bookId: 42,
  wordId: 7,
  stepIndex: 0,
  attemptNo: 1,
  stepKind: "type",
  response: "apple",
};

beforeEach(() => {
  getLearnMock.mockReset();
  getReviewMock.mockReset();
  applyStepMock.mockReset();
});

afterEach(() => {
  authState.session = null;
});

describe("GET /api/vocabulary/session", () => {
  it("chưa đăng nhập → 401 not-authenticated", async () => {
    authState.session = null;
    const res = await GET(get("kind=learn&book=42"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(getLearnMock).not.toHaveBeenCalled();
  });

  it.each([
    ["", "invalidKind"], // thiếu kind
    ["kind=quiz&book=42", "invalidKind"],
    ["kind=LEARN&book=42", "invalidKind"], // case-sensitive — client render
    ["kind=learn", "invalidBook"], // learn CẦN book
    ["kind=learn&book=abc", "invalidBook"],
    ["kind=learn&book=0", "invalidBook"],
    ["kind=learn&book=-1", "invalidBook"],
    ["kind=review&book=abc", "invalidBook"],
    ["kind=review&word=abc", "invalidStep"], // ?word= prefill phải là số
  ])("%s → 400 %s", async (query, err) => {
    authState.session = { user: { id: "u1" } };
    const res = await GET(get(query));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: err });
  });

  it("learn success → 200 {ok, sessionKey, kind, bookId, steps}; store nhận (userId, bookId)", async () => {
    authState.session = { user: { id: "u1" } };
    getLearnMock.mockResolvedValue({
      ok: true,
      sessionKey: "sk-gen",
      kind: "learn",
      bookId: 42,
      steps: [{ stepIndex: 0, kind: "introduce", wordId: 7 }],
    });
    const res = await GET(get("kind=learn&book=42"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, sessionKey: "sk-gen", kind: "learn", bookId: 42 });
    expect(json.steps).toHaveLength(1);
    expect(getLearnMock).toHaveBeenCalledWith("u1", 42);
  });

  it("review scope all / book / prefill → store nhận scope đúng", async () => {
    authState.session = { user: { id: "u1" } };
    getReviewMock.mockResolvedValue({ ok: true, sessionKey: "sk", kind: "review", bookId: null, steps: [] });
    await GET(get("kind=review"));
    expect(getReviewMock).toHaveBeenCalledWith("u1", {});
    await GET(get("kind=review&book=42"));
    expect(getReviewMock).toHaveBeenCalledWith("u1", { bookId: 42 });
    await GET(get("kind=review&word=9"));
    expect(getReviewMock).toHaveBeenCalledWith("u1", { wordId: 9 });
  });

  it("steps rỗng (sách hoàn thành / due hết) → 200 {ok, steps:[]} KHÔNG 204", async () => {
    authState.session = { user: { id: "u1" } };
    getLearnMock.mockResolvedValue({ ok: true, sessionKey: "sk", kind: "learn", bookId: 42, steps: [] });
    const res = await GET(get("kind=learn&book=42"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sessionKey: "sk", kind: "learn", bookId: 42, steps: [] });
  });

  it("store invalidBook → 400; wordNotFound (prefill) → 404", async () => {
    authState.session = { user: { id: "u1" } };
    getLearnMock.mockResolvedValue({ ok: false, error: "invalidBook" });
    expect((await GET(get("kind=learn&book=9999"))).status).toBe(400);
    getReviewMock.mockResolvedValue({ ok: false, error: "wordNotFound" });
    expect((await GET(get("kind=review&word=404"))).status).toBe(404);
  });
});

describe("POST /api/vocabulary/session", () => {
  it("chưa đăng nhập → 401, không đụng store", async () => {
    authState.session = null;
    const res = await POST(post(validBody));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(applyStepMock).not.toHaveBeenCalled();
  });

  it("body không phải JSON → 400 invalidJson", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post("{không-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{ ...validBody, sessionKey: "" }, "invalidSession"],
    [{ ...validBody, sessionKey: 123 }, "invalidSession"],
    [{ ...validBody, kind: "quiz" }, "invalidKind"],
    [{ ...validBody, bookId: 0 }, "invalidBook"],
    [{ ...validBody, bookId: "abc" }, "invalidBook"],
    [{ ...validBody, wordId: -1 }, "invalidStep"],
    [{ ...validBody, stepIndex: -1 }, "invalidStep"],
    [{ ...validBody, stepIndex: 1.5 }, "invalidStep"],
    [{ ...validBody, attemptNo: 0 }, "invalidStep"],
    [{ ...validBody, stepKind: "matching" }, "invalidStep"],
    [{ ...validBody, stepKind: "introduce" }, "invalidStep"], // introduce không chấm
    [{ ...validBody, response: "" }, "invalidResponse"],
    [{ ...validBody, response: "   " }, "invalidResponse"],
  ])("body %j → 400 %s", async (body, err) => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: err });
    expect(applyStepMock).not.toHaveBeenCalled();
  });

  it("body hợp lệ → store nhận (userId, req), 200 passthrough GradeResult", async () => {
    authState.session = { user: { id: "u1" } };
    applyStepMock.mockResolvedValue({
      ok: true,
      result: {
        correct: true,
        grade: { quality: 4, ease: 2.5, intervalDays: 1, reps: 1, dueAt: "2026-10-10T00:00:00.000Z", lapses: 0 },
        xpAwarded: 5,
        xpCapped: false,
        totalXp: 15,
        streak: 2,
        goalDone: false,
      },
    });
    const res = await POST(post(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    // Response FLAT theo spec §5 — fields không bọc object con
    expect(json).toMatchObject({
      ok: true,
      correct: true,
      xpAwarded: 5,
      xpCapped: false,
      totalXp: 15,
      streak: 2,
      goalDone: false,
    });
    expect(json.grade.reps).toBe(1);
    expect(applyStepMock).toHaveBeenCalledWith("u1", validBody);
  });

  it.each([
    ["wordNotFound", 404],
    ["sessionNotFound", 404],
  ])("store %s → %i", async (err, status) => {
    authState.session = { user: { id: "u1" } };
    applyStepMock.mockResolvedValue({ ok: false, error: err });
    const res = await POST(post(validBody));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, error: err });
  });

  it("store throw lạ → 500 generic", async () => {
    authState.session = { user: { id: "u1" } };
    applyStepMock.mockRejectedValue(new Error("db down"));
    const res = await POST(post(validBody));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

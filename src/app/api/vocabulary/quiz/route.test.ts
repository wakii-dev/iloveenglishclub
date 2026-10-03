import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/vocabulary/quiz route contract (SF-4 t-4.1) — mock @/auth + store.
 * GET: book_id thiếu/lệch → 400; hợp lệ → đề từ store. POST: chưa đăng nhập
 * → 401; invalidJson / invalidBookId / invalidMode / invalidAnswer → 400;
 * bookNotFound → 404; chấm xong → 200 kèm score; store ném lỗi → 500.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const storeMock = vi.hoisted(() => ({
  buildBookQuiz: vi.fn(),
  submitQuizAttempt: vi.fn(),
}));
vi.mock("@/lib/vocabulary/quiz-store", () => ({
  buildBookQuiz: storeMock.buildBookQuiz,
  submitQuizAttempt: storeMock.submitQuizAttempt,
}));

const { GET, POST } = await import("./route");

const GET_URL = "http://localhost/api/vocabulary/quiz";

function post(body: unknown): NextRequest {
  return new NextRequest(GET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  storeMock.buildBookQuiz.mockReset();
  storeMock.submitQuizAttempt.mockReset();
});

afterEach(() => {
  authState.session = null;
});

describe("GET /api/vocabulary/quiz", () => {
  it.each([
    [GET_URL, "thiếu book_id"],
    [`${GET_URL}?book_id=0`, "book_id = 0"],
    [`${GET_URL}?book_id=-2`, "book_id âm"],
    [`${GET_URL}?book_id=abc`, "book_id không phải số"],
  ])("%s (%s) → 400 invalidBookId", async (url) => {
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidBookId" });
    expect(storeMock.buildBookQuiz).not.toHaveBeenCalled();
  });

  it("book_id hợp lệ → 200 kèm đề, store nhận đúng bookId", async () => {
    storeMock.buildBookQuiz.mockResolvedValue([
      {
        type: "fill-word",
        wordId: 5,
        meaningVi: "nghĩa 5",
        letterCount: 5,
      },
    ]);
    const res = await GET(new NextRequest(`${GET_URL}?book_id=3`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, bookId: 3, mode: "mixed" });
    expect(json.questions).toHaveLength(1);
    expect(storeMock.buildBookQuiz).toHaveBeenCalledWith(3);
  });
});

describe("POST /api/vocabulary/quiz", () => {
  const validAnswers = [
    { word_id: 1, type: "fill-word", response: "word1" },
    { word_id: 2, type: "multiple-choice", response: "nghĩa 2" },
  ];

  it("chưa đăng nhập → 401 not-authenticated, không đụng store", async () => {
    authState.session = null;
    const res = await POST(post({ book_id: 3, answers: validAnswers }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "not-authenticated" });
    expect(storeMock.submitQuizAttempt).not.toHaveBeenCalled();
  });

  it("body không phải JSON → 400 invalidJson", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post("{không-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidJson" });
  });

  it.each([
    [{ answers: validAnswers }, "invalidBookId"], // thiếu book_id
    [{ book_id: 0, answers: validAnswers }, "invalidBookId"],
    [{ book_id: "abc", answers: validAnswers }, "invalidBookId"],
    [
      { book_id: 3, mode: "cheat-mode", answers: validAnswers },
      "invalidMode",
    ],
    [{ book_id: 3 }, "invalidAnswer"], // thiếu answers
    [{ book_id: 3, answers: [] }, "invalidAnswer"], // mảng rỗng
    [{ book_id: 3, answers: [{ type: "fill-word", response: "x" }] }, "invalidAnswer"],
    [{ book_id: 3, answers: [{ word_id: 0, type: "fill-word", response: "x" }] }, "invalidAnswer"],
    [{ book_id: 3, answers: [{ word_id: 1, type: "word-hunt", response: "x" }] }, "invalidAnswer"],
    [{ book_id: 3, answers: [{ word_id: 1, type: "fill-word", response: "" }] }, "invalidAnswer"],
    [{ book_id: 3, answers: [{ word_id: 1, type: "fill-word", response: 42 }] }, "invalidAnswer"],
  ])("body %j → 400 %s", async (body, err) => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: err });
    expect(storeMock.submitQuizAttempt).not.toHaveBeenCalled();
  });

  it("response > 500 ký tự → 400 invalidAnswer", async () => {
    authState.session = { user: { id: "u1" } };
    const res = await POST(
      post({
        book_id: 3,
        answers: [{ word_id: 1, type: "fill-word", response: "a".repeat(501) }],
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidAnswer" });
  });

  it("body hợp lệ → store nhận (userId, bookId, mode, answers camelCase), 200 kèm score", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: true,
      score: 0.8,
      correct: 8,
      total: 10,
      detail: [],
    });
    const res = await POST(post({ book_id: 3, answers: validAnswers }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, score: 0.8, correct: 8, total: 10 });
    expect(storeMock.submitQuizAttempt).toHaveBeenCalledWith("u1", 3, "mixed", [
      { wordId: 1, type: "fill-word", response: "word1" },
      { wordId: 2, type: "multiple-choice", response: "nghĩa 2" },
    ]);
  });

  it("mode tùy chọn được truyền qua (multiple-choice)", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: true,
      score: 1,
      correct: 1,
      total: 1,
      detail: [],
    });
    await POST(
      post({
        book_id: 3,
        mode: "multiple-choice",
        answers: [{ word_id: 1, type: "multiple-choice", response: "nghĩa 1" }],
      }),
    );
    expect(storeMock.submitQuizAttempt).toHaveBeenCalledWith(
      "u1",
      3,
      "multiple-choice",
      expect.any(Array),
    );
  });

  it("bookNotFound → 404", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: false,
      error: "bookNotFound",
    });
    const res = await POST(post({ book_id: 999, answers: validAnswers }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("word ngoài pool → invalidAnswer 400 (từ store)", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: false,
      error: "invalidAnswer",
    });
    const res = await POST(post({ book_id: 3, answers: validAnswers }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidAnswer" });
  });

  it("store ném lỗi lạ → 500 generic + log", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ book_id: 3, answers: validAnswers }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "generic" });
  });
});

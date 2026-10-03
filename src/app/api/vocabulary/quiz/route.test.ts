import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/vocabulary/quiz route contract (SF-4 t-4.1; scope hub SF-3 t-3.2) —
 * mock @/auth + store. GET: book_id thiếu/lệch → 400 (contract cũ); scope=all
 * / scope=multi&book_ids → đề theo scope; scope lạ → 400 invalidScope,
 * book_ids hỏng → 400 invalidBookIds. POST: chưa đăng nhập → 401; invalidJson
 * / invalidBookId / invalidScope / invalidBookIds / invalidMode /
 * invalidAnswer → 400; bookNotFound + poolNotFound → 404; chấm xong → 200
 * kèm score; store ném lỗi → 500.
 */
const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const storeMock = vi.hoisted(() => ({
  buildHubQuiz: vi.fn(),
  submitQuizAttempt: vi.fn(),
}));
vi.mock("@/lib/vocabulary/quiz-store", () => ({
  buildHubQuiz: storeMock.buildHubQuiz,
  submitQuizAttempt: storeMock.submitQuizAttempt,
}));

const { GET, POST } = await import("./route");

const GET_URL = "http://localhost/api/vocabulary/quiz";

function get(url: string): NextRequest {
  return new NextRequest(url);
}

function post(body: unknown): NextRequest {
  return new NextRequest(GET_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  storeMock.buildHubQuiz.mockReset();
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
  ])("%s (%s) → 400 invalidBookId (contract cũ)", async (url) => {
    const res = await GET(get(url));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalidBookId" });
    expect(storeMock.buildHubQuiz).not.toHaveBeenCalled();
  });

  it("book_id hợp lệ → 200 kèm đề + bookId, store nhận scope book", async () => {
    storeMock.buildHubQuiz.mockResolvedValue([
      { type: "fill-word", wordId: 5, meaningVi: "nghĩa 5", letterCount: 5 },
    ]);
    const res = await GET(get(`${GET_URL}?book_id=3`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, bookId: 3, mode: "mixed" });
    expect(json.questions).toHaveLength(1);
    expect(storeMock.buildHubQuiz).toHaveBeenCalledWith({
      kind: "book",
      bookId: 3,
    });
  });

  it("SF-3 t-3.2: scope=all → đề mọi nguồn, response kèm scope", async () => {
    storeMock.buildHubQuiz.mockResolvedValue([]);
    const res = await GET(get(`${GET_URL}?scope=all`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, scope: { kind: "all" }, mode: "mixed" });
    expect(storeMock.buildHubQuiz).toHaveBeenCalledWith({ kind: "all" });
  });

  it("SF-3 t-3.2: scope=multi&book_ids=1,2,3 → store nhận bookIds đã parse", async () => {
    storeMock.buildHubQuiz.mockResolvedValue([]);
    const res = await GET(get(`${GET_URL}?scope=multi&book_ids=1,2,3`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      ok: true,
      scope: { kind: "multi", bookIds: [1, 2, 3] },
    });
    expect(storeMock.buildHubQuiz).toHaveBeenCalledWith({
      kind: "multi",
      bookIds: [1, 2, 3],
    });
  });

  it("SF-3 t-3.2: scope=book&book_id=7 → store nhận scope book", async () => {
    storeMock.buildHubQuiz.mockResolvedValue([]);
    await GET(get(`${GET_URL}?scope=book&book_id=7`));
    expect(storeMock.buildHubQuiz).toHaveBeenCalledWith({
      kind: "book",
      bookId: 7,
    });
  });

  it.each([
    [`${GET_URL}?scope=gia-lập`, "invalidScope", "scope lạ"],
    [`${GET_URL}?scope=book`, "invalidBookId", "book scope thiếu book_id"],
    [`${GET_URL}?scope=book&book_id=0`, "invalidBookId", "book_id = 0"],
    [`${GET_URL}?scope=multi`, "invalidBookIds", "multi thiếu book_ids"],
    [`${GET_URL}?scope=multi&book_ids=`, "invalidBookIds", "book_ids rỗng"],
    [`${GET_URL}?scope=multi&book_ids=1,x`, "invalidBookIds", "book_ids lẫn chữ"],
    [`${GET_URL}?scope=multi&book_ids=0`, "invalidBookIds", "book_ids = 0"],
  ])("%s (%s) → 400 %s", async (url, err) => {
    const res = await GET(get(url));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: err });
    expect(storeMock.buildHubQuiz).not.toHaveBeenCalled();
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
    [{ scope: "gia-lập", answers: validAnswers }, "invalidScope"],
    [{ scope: 42, answers: validAnswers }, "invalidScope"],
    [{ scope: "book", answers: validAnswers }, "invalidBookId"],
    [{ scope: "multi", answers: validAnswers }, "invalidBookIds"],
    [{ scope: "multi", book_ids: [], answers: validAnswers }, "invalidBookIds"],
    [
      { scope: "multi", book_ids: [0, -1], answers: validAnswers },
      "invalidBookIds",
    ],
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

  it("body hợp lệ (book_id cũ) → store nhận (userId, scope book, mode, answers camelCase), 200 kèm score", async () => {
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
    expect(storeMock.submitQuizAttempt).toHaveBeenCalledWith(
      "u1",
      { kind: "book", bookId: 3 },
      "mixed",
      [
        { wordId: 1, type: "fill-word", response: "word1" },
        { wordId: 2, type: "multiple-choice", response: "nghĩa 2" },
      ],
    );
  });

  it("SF-3 t-3.2: body scope=all → store nhận scope all", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: true,
      score: 1,
      correct: 1,
      total: 1,
      detail: [],
    });
    await POST(post({ scope: "all", answers: validAnswers }));
    expect(storeMock.submitQuizAttempt).toHaveBeenCalledWith(
      "u1",
      { kind: "all" },
      "mixed",
      expect.any(Array),
    );
  });

  it("SF-3 t-3.2: body scope=multi + book_ids → store nhận bookIds", async () => {
    authState.session = { user: { id: "u1" } };
    storeMock.submitQuizAttempt.mockResolvedValue({
      ok: true,
      score: 1,
      correct: 2,
      total: 2,
      detail: [],
    });
    await POST(
      post({ scope: "multi", book_ids: [2, 2, 5], answers: validAnswers }),
    );
    expect(storeMock.submitQuizAttempt).toHaveBeenCalledWith(
      "u1",
      { kind: "multi", bookIds: [2, 5] },
      "mixed",
      expect.any(Array),
    );
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
      { kind: "book", bookId: 3 },
      "multiple-choice",
      expect.any(Array),
    );
  });

  it.each(["bookNotFound", "poolNotFound"])(
    "store %s → 404",
    async (err) => {
      authState.session = { user: { id: "u1" } };
      storeMock.submitQuizAttempt.mockResolvedValue({ ok: false, error: err });
      const res = await POST(post({ scope: "all", answers: validAnswers }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ ok: false, error: err });
    },
  );

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

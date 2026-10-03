import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Quiz DB leg (SF-4 t-4.1) — mock @/db chainable (pattern review-store.test.ts).
 * Contract: pool query lỗi (bảng chưa migrate) → bookNotFound thay vì crash;
 * submit chấm đúng + persist {userId, bookId, mode, score, detailJson}; word
 * ngoài pool → invalidAnswer; insert lỗi → rethrow; leaderboard lỗi → [].
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  // Lỗi THEO THỨ TỪNG query (chainOf = 1 query): null = query đó thành công
  failQueue: [] as (unknown | null)[],
  calls: [] as unknown[],
}));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const failure =
    dbState.failQueue.length > 0
      ? dbState.failQueue.shift()
      : dbState.failWith;
  const p =
    failure != null ? Promise.reject(failure) : Promise.resolve(result);
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return p.then.bind(p);
      if (prop === "catch") return p.catch.bind(p);
      return (arg: unknown) => {
        dbState.calls.push(arg);
        return proxy;
      };
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
  },
}));

import { submitQuizAttempt, topQuizScores } from "./quiz-store";

const ANSWERS = [
  { wordId: 1, type: "fill-word" as const, response: "word1" },
  { wordId: 2, type: "multiple-choice" as const, response: "nghĩa 2" },
];

const POOL = [
  { wordId: 1, word: "word1", meaningVi: "nghĩa 1", ipa: null },
  { wordId: 2, word: "word2", meaningVi: "nghĩa 2", ipa: "ipa2" },
];

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.failQueue = [];
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("submitQuizAttempt", () => {
  it("pool query lỗi (bảng chưa migrate) → bookNotFound, không crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "book_words" does not exist');
    const result = await submitQuizAttempt("u1", 3, "mixed", ANSWERS);
    expect(result).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("book không có từ (pool rỗng) → bookNotFound", async () => {
    dbState.queue = [[]];
    const result = await submitQuizAttempt("u1", 3, "mixed", ANSWERS);
    expect(result).toEqual({ ok: false, error: "bookNotFound" });
  });

  it("word ngoài pool → invalidAnswer, không chấm không ghi", async () => {
    dbState.queue = [POOL];
    const result = await submitQuizAttempt("u1", 3, "mixed", [
      { wordId: 999, type: "fill-word", response: "word1" },
    ]);
    expect(result).toEqual({ ok: false, error: "invalidAnswer" });
    expect(dbState.calls).toHaveLength(5); // chỉ select chain (from+2 join+where+orderBy), không insert
  });

  it("chấm đúng + persist {userId, bookId, mode, score, detailJson}", async () => {
    dbState.queue = [POOL, []];
    const result = await submitQuizAttempt("u1", 3, "mixed", ANSWERS);
    expect(result).toMatchObject({ ok: true, score: 1, correct: 2, total: 2 });
    // calls: [from, innerJoin, innerJoin, where, orderBy, insert.values]
    const values = dbState.calls[5] as Record<string, unknown>;
    expect(values).toMatchObject({
      userId: "u1",
      bookId: 3,
      mode: "mixed",
      score: 1,
    });
    expect(values.detailJson).toHaveLength(2);
  });

  it("một đúng một sai → score 0.5", async () => {
    dbState.queue = [
      [POOL[0]!, { ...POOL[1]!, meaningVi: "nghĩa khác hẳn" }],
      [],
    ];
    const result = await submitQuizAttempt("u1", 3, "mixed", ANSWERS);
    expect(result).toMatchObject({ ok: true, score: 0.5, correct: 1, total: 2 });
  });

  it("insert lỗi → rethrow (route trả 500)", async () => {
    dbState.queue = [POOL];
    dbState.failQueue = [null, new Error("boom")];
    await expect(
      submitQuizAttempt("u1", 3, "mixed", ANSWERS),
    ).rejects.toThrow("boom");
  });
});

describe("topQuizScores", () => {
  it("query lỗi (bảng chưa migrate) → [] + log, không làm đổ trang", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "quiz_attempts" does not exist');
    expect(await topQuizScores()).toEqual([]);
  });

  it("trả rows bestScore đã Number() hoá", async () => {
    dbState.queue = [
      [
        { displayName: "An", avatarUrl: null, bestScore: "0.85" },
        { displayName: "Bình", avatarUrl: null, bestScore: 0.5 },
      ],
    ];
    const rows = await topQuizScores();
    expect(rows).toEqual([
      { displayName: "An", avatarUrl: null, bestScore: 0.85 },
      { displayName: "Bình", avatarUrl: null, bestScore: 0.5 },
    ]);
  });
});

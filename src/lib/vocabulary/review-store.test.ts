import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Review DB leg (SF-3 t-3.3) — mock @/db chainable (pattern
 * vocabulary-store.test.ts) + MỞ RỘNG: ghi nhận tham số method (dbState.calls)
 * để assert giá trị SRS engine tính ra được persist đúng. Contract:
 * row mới → engine default 2.5/0/0, row có sẵn → state hiện có; q<3 reset;
 * upsert theo PK (user, word); FK 23503 → wordNotFound; due query lỗi → [].
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  // Lỗi THEO THỨ TỪNG query (t-3.1 subquery) — null = query đó thành công
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
  // Callable target + self-reference qua closure — method call ghi nhận tham
  // số vào calls (values/set/where/limit/target) rồi trả chính proxy.
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

import { applyReview, listDueWords } from "./review-store";

const DAY_MS = 86_400_000;

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.failQueue = [];
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("listDueWords", () => {
  it("trả rows join phẳng theo thứ tự due_at", async () => {
    dbState.queue = [
      [
        {
          wordId: 7,
          word: "apple",
          ipa: "ˈæp.əl",
          meaningVi: "quả táo",
          example: "an apple a day",
          audioUrl: null,
          ease: 2.5,
          intervalDays: 0,
          reps: 0,
        },
      ],
    ];
    const due = await listDueWords("u1");
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ wordId: 7, word: "apple", meaningVi: "quả táo" });
  });

  it("DB lỗi (bảng chưa migrate) → [] + log, không throw — build-safe", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "user_word_progress" does not exist');
    expect(await listDueWords("u1")).toEqual([]);
  });

  it("SF-3 t-3.1: filter bookId — rows vẫn trả về, DB lỗi vẫn [] (nhánh subquery)", async () => {
    // mock shift ngay lúc db.select(): [select-subquery book_words, select chính]
    dbState.queue = [
      [],
      [{ wordId: 7, word: "apple", meaningVi: "quả táo" }],
    ];
    expect(await listDueWords("u1", { bookId: 3 })).toHaveLength(1);
    vi.spyOn(console, "error").mockImplementation(() => {});
    // failQueue theo thứ tự select: subquery [] (không await — reject sẽ thành
    // unhandled rejection), query chính lỗi → catch trả []
    dbState.queue = [[], []];
    dbState.failQueue = [null, new Error('relation "book_words" does not exist')];
    expect(await listDueWords("u1", { bookId: 3 })).toEqual([]);
  });
});

describe("applyReview", () => {
  it("row MỚI (chưa có progress): engine default ease 2.5 → q=4 rep1 interval 1 ngày", async () => {
    dbState.queue = [[], [{ ease: 2.5, intervalDays: 1, reps: 1, dueAt: new Date() }]];
    const before = Date.now();
    const result = await applyReview("u1", 7, 4);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progress).toMatchObject({ ease: 2.5, intervalDays: 1, reps: 1 });
    }
    // calls: [from, where, limit, insert.values, onConflict, returning] — mock select/insert khong ghi nhan tham so
    const values = dbState.calls[3] as Record<string, unknown>;
    expect(values).toMatchObject({
      userId: "u1",
      wordId: 7,
      ease: 2.5,
      intervalDays: 1,
      reps: 1,
    });
    const dueAt = values.dueAt as Date;
    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before + DAY_MS - 1000);
    expect(values.lastReviewedAt).toBeInstanceOf(Date);
    // upsert đúng PK composite (user, word)
    const conflict = dbState.calls[4] as { target: unknown[] };
    expect(conflict.target).toHaveLength(2);
  });

  it("row CÓ SẢN (ease 2.5, reps 2, interval 6): q=4 → rep3 interval 15", async () => {
    dbState.queue = [
      [{ ease: 2.5, intervalDays: 6, reps: 2 }],
      [{ ease: 2.5, intervalDays: 15, reps: 3, dueAt: new Date() }],
    ];
    const result = await applyReview("u1", 7, 4);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.progress.intervalDays).toBe(15);
    const values = dbState.calls[3] as Record<string, unknown>;
    expect(values).toMatchObject({ ease: 2.5, intervalDays: 15, reps: 3 });
  });

  it("q=0 (Lại): reset reps 0, interval 1, ease tụt 2.5 → 1.7", async () => {
    dbState.queue = [
      [{ ease: 2.5, intervalDays: 15, reps: 3 }],
      [{ ease: 1.7, intervalDays: 1, reps: 0, dueAt: new Date() }],
    ];
    const result = await applyReview("u1", 7, 0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.progress).toMatchObject({ ease: 1.7, intervalDays: 1, reps: 0 });
    const values = dbState.calls[3] as Record<string, unknown>;
    expect(values.intervalDays).toBe(1);
    expect(values.reps).toBe(0);
    expect(values.ease).toBeCloseTo(1.7, 10);
  });

  it("word_id không tồn tại → FK 23503 → wordNotFound, không crash", async () => {
    dbState.queue = [[]];
    dbState.failWith = { code: "23503" };
    const result = await applyReview("u1", 999, 4);
    expect(result).toEqual({ ok: false, error: "wordNotFound" });
  });

  it("lỗi lạ → rethrow (không nuốt)", async () => {
    dbState.failWith = new Error("boom");
    await expect(applyReview("u1", 7, 4)).rejects.toThrow("boom");
  });
});

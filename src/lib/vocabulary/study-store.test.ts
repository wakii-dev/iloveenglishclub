import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Bulk seed "Bắt đầu học sách này" (story vocabulary-learn t-1.2) — mock @/db
 * chainable (pattern review-store.test.ts) ghi nhận tham số để assert: seed
 * ĐỦ words cả book theo book_words.order, due_at trải STUDY_WORDS_PER_DAY
 * từ/ngày từ mốc hiện tại, onConflictDoNothing đúng PK (user, word) → chạy
 * lại KHÔNG đè SRS state sẵn có, return { added, total }. DB lỗi → fallback
 * { 0, 0 } build-safe.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  // Lỗi THEO THỨ TỪNG query (select → insert) — null = query đó thành công
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

import { seedBookProgress } from "./study-store";

const DAY_MS = 86_400_000;

/** wordId 1..7 theo book_words.order — sách mẫu 7 từ. */
const BOOK_WORDS = Array.from({ length: 7 }, (_, i) => ({ wordId: i + 1 }));

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.failQueue = [];
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("seedBookProgress", () => {
  it("seed ĐỦ 7 từ, due_at trải 5/ngày (5 ngày 0 + 2 ngày 1), reps/ease để default DB", async () => {
    dbState.queue = [BOOK_WORDS, BOOK_WORDS.map((w) => ({ wordId: w.wordId }))];
    const before = Date.now();
    const result = await seedBookProgress("u1", 5);

    expect(result).toEqual({ added: 7, total: 7 });
    // mock không ghi nhận arg của db.select()/db.insert() gốc (pattern
    // review-store.test) — calls: [from, where, orderBy, values, onConflict,
    // returning] → values ở [3], conflict ở [4]
    const values = dbState.calls[3] as {
      userId: string;
      wordId: number;
      dueAt: Date;
    }[];
    expect(values).toHaveLength(7);
    expect(values.map((v) => v.wordId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const v of values) {
      expect(v.userId).toBe("u1");
      // reps/ease/interval KHÔNG set tay — DB default (0/2.5/0) giữ SRS sạch
      expect(v).not.toHaveProperty("reps");
      expect(v).not.toHaveProperty("ease");
    }
    // 5 từ đầu đến hạn ngay (≥ mốc trước 1s), 2 từ cuối +1 ngày
    for (const v of values.slice(0, 5)) {
      expect(v.dueAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    }
    expect(values[5]!.dueAt.getTime()).toBeGreaterThanOrEqual(
      before + DAY_MS - 1000,
    );
    // onConflict đúng PK composite (user, word) — seed lại không đè state
    const conflict = dbState.calls[4] as { target: unknown[] };
    expect(conflict.target).toHaveLength(2);
  });

  it("book trùng word đã học: insert returning chỉ rows mới → added < total", async () => {
    dbState.queue = [BOOK_WORDS, [{ wordId: 6 }, { wordId: 7 }]];
    const result = await seedBookProgress("u1", 5);
    expect(result).toEqual({ added: 2, total: 7 });
  });

  it("book không có từ (select []) → KHÔNG insert, { added: 0, total: 0 }", async () => {
    dbState.queue = [[]];
    const result = await seedBookProgress("u1", 999);
    expect(result).toEqual({ added: 0, total: 0 });
    // chỉ 1 query select (from/where/orderBy) — không lẻ values() rỗng
    expect(dbState.calls).toHaveLength(3);
  });

  it("DB lỗi (bảng chưa migrate) → { added: 0, total: 0 } + log, không throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "book_words" does not exist');
    expect(await seedBookProgress("u1", 5)).toEqual({ added: 0, total: 0 });
  });

  it("lỗi insert (sau select OK) → vẫn fallback build-safe { 0, 0 }", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.queue = [BOOK_WORDS];
    dbState.failQueue = [null, { code: "23503" }];
    expect(await seedBookProgress("u1", 999)).toEqual({ added: 0, total: 0 });
  });
});

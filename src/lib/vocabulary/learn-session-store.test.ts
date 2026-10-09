import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Session DB leg (SF-2, VU-39) — mock @/db chainable + transaction (pattern
 * vocab-xp-store.test.ts; queue ĐÚNG số await của impl — MỌI chain consume 1
 * item). Contract: queue SQL-side BOUNDED (LIMIT/OFFSET pin §6.8 — cấm
 * load-all), sessionKey UUID, learn = level chunk đầu còn reps=0 (levels.ts),
 * review = due_at ≤ now() oldest-first LIMIT 50, prefill 1 từ theo progress
 * row. applyStep: scope → grade → duplicate cached ZERO write → MỘT
 * transaction session-step + (type) SRS grade + lapses + learn-complete khi
 * pre-reps=0→post≥1 + goalDone.
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  calls: [] as unknown[],
}));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p =
    dbState.failWith !== null
      ? Promise.reject(dbState.failWith)
      : Promise.resolve(result);
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

function txMock() {
  return {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
  };
}

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
  },
}));

import {
  applyStep,
  DUE_LIMIT,
  getLearnSession,
  getReviewSession,
  type SessionWord,
} from "./learn-session-store";

const word = (over: Partial<SessionWord> & { wordId: number }): SessionWord => ({
  word: `w${over.wordId}`,
  ipa: null,
  meaningVi: `nghĩa ${over.wordId}`,
  example: null,
  audioUrl: null,
  ...over,
});

/** plain-record guard — loại PgTable/PgColumn/SQL (args của insert/from/select). */
const isPayload = (c: unknown): c is Record<string, unknown> =>
  typeof c === "object" && c !== null && !(".Symbol" in c) && !Array.isArray(c);

/** Số 0-999 guard: limit/offset/stepIndex là number thuần trong calls. */
const numbers = () => dbState.calls.filter((c): c is number => typeof c === "number");

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("getLearnSession — queue SQL-side bounded (context pack #6)", () => {
  it("sách chưa học: queue 5 từ đầu chunk — trả steps đầy đủ + sessionKey UUID", async () => {
    // queue: book check → pool → min unplanted order → count → window 10 rows
    const windowRows = Array.from({ length: 10 }, (_, i) => ({
      wordId: i + 1,
      order: i + 1,
      reps: 0,
      word: `w${i + 1}`,
      ipa: null,
      meaningVi: `nghĩa ${i + 1}`,
      audioUrl: i < 2 ? `https://cdn.test/${i}.mp3` : null,
      example: null,
    }));
    dbState.queue = [
      [{ id: 42 }], // books check
      [{ meaningVi: "nghĩa nhiễu" }], // pool distractor
      [{ order: 1 }], // min unplanted order
      [{ n: 0 }], // count trước minOrder
      windowRows, // window chunk OFFSET 0 LIMIT 10
    ];
    const result = await getLearnSession("u1", 42);
    if (!result.ok) throw new Error(result.error);
    expect(result.kind).toBe("learn");
    expect(result.bookId).toBe(42);
    expect(result.sessionKey).toMatch(/^[0-9a-f-]{36}$/);
    // queue = 5 từ reps=0 đầu của chunk — steps chuỗi per từ
    const wordIds = [...new Set(result.steps.map((s) => s.wordId))];
    expect(wordIds).toEqual([1, 2, 3, 4, 5]);
    expect(result.steps[0]?.kind).toBe("introduce");
    expect(result.steps.at(-1)?.kind).toBe("type");
  });

  it("query shape: book check → pool LIMIT 500 → min LIMIT 1 → count → window OFFSET+LIMIT 10 — KHÔNG load-all", async () => {
    dbState.queue = [
      [{ id: 42 }],
      [{ meaningVi: "n" }], // pool
      [{ order: 1 }], // min unplanted tồn tại
      [{ n: 12 }],
      [], // window rỗng (không thể xảy ra với min tồn tại) → steps []
    ];
    await getLearnSession("u1", 42);
    // limit/offset pin: pool 500, min 1, window 10 — KHÔNG có limit toàn book
    const nums = numbers();
    expect(nums).toContain(500);
    expect(nums).toContain(1);
    expect(nums).toContain(10);
    expect(nums).not.toContain(1000); // không quét cả book
  });

  it("level 1 planted hết: min unplanted nằm chunk sau — window OFFSET đúng vị trí count", async () => {
    dbState.queue = [
      [{ id: 42 }],
      [{ meaningVi: "n" }],
      [{ order: 11 }], // từ đầu unplanted ở order 11 (chunk 2)
      [{ n: 10 }], // 10 từ trước nó → chunkStart = floor(10/10)*10 = 10
      [
        {
          wordId: 11,
          order: 11,
          reps: 0,
          word: "w11",
          ipa: null,
          meaningVi: "n11",
          audioUrl: null,
          example: null,
        },
      ],
    ];
    const result = await getLearnSession("u1", 42);
    if (!result.ok) throw new Error(result.error);
    const nums = numbers();
    expect(nums).toContain(10); // OFFSET chunkStart
    const wordIds = [...new Set(result.steps.map((s) => s.wordId))];
    expect(wordIds).toEqual([11]);
  });

  it("chunk lẻ: window 10 từ nhưng chỉ 3 reps=0 → queue 3 từ (không gay cứng 5)", async () => {
    const windowRows = [
      ...Array.from({ length: 7 }, (_, i) => ({
        wordId: i + 1,
        order: i + 1,
        reps: 1,
        word: `w${i + 1}`,
        ipa: null,
        meaningVi: `n${i + 1}`,
        audioUrl: null,
        example: null,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        wordId: i + 8,
        order: i + 8,
        reps: 0,
        word: `w${i + 8}`,
        ipa: null,
        meaningVi: `n${i + 8}`,
        audioUrl: null,
        example: null,
      })),
    ];
    dbState.queue = [[{ id: 42 }], [], [{ order: 8 }], [{ n: 7 }], windowRows];
    const result = await getLearnSession("u1", 42);
    if (!result.ok) throw new Error(result.error);
    const wordIds = [...new Set(result.steps.map((s) => s.wordId))];
    expect(wordIds).toEqual([8, 9, 10]);
  });

  it("sách hoàn thành (không còn reps=0) → {ok, steps:[]} 200-rỗng", async () => {
    dbState.queue = [[{ id: 42 }], [], []]; // book check, pool, min unplanted KHÔNG có
    const result = await getLearnSession("u1", 42);
    expect(result).toMatchObject({ ok: true, steps: [] });
  });

  it("book không tồn tại → invalidBook (route 400)", async () => {
    dbState.queue = [[]];
    const result = await getLearnSession("u1", 9999);
    expect(result).toEqual({ ok: false, error: "invalidBook" });
  });
});

describe("getReviewSession — due SQL-side (context pack #6)", () => {
  it("due queue: oldest-due-first LIMIT 50, steps (listen|mc)→type", async () => {
    // NHẮC mock: select() consume EAGER theo LẦN GỌI (không phải theo await)
    // — inArray subquery (book filter) consume 1 item lúc BUILD query
    dbState.queue = [
      [{ id: 42 }], // book check
      [], // inArray subquery (book_words) — filler, kết quả không await
      [
        {
          wordId: 7,
          word: "w7",
          ipa: null,
          meaningVi: "n7",
          audioUrl: "https://cdn.test/7.mp3",
          example: null,
        },
        {
          wordId: 8,
          word: "w8",
          ipa: null,
          meaningVi: "n8",
          audioUrl: null,
          example: null,
        },
      ], // due rows
      [{ meaningVi: "n7" }, { meaningVi: "n8" }], // pool
    ];
    const result = await getReviewSession("u1", { bookId: 42 });
    if (!result.ok) throw new Error(result.error);
    expect(result.kind).toBe("review");
    const kinds = result.steps.map((s) => `${s.kind}#${s.wordId}`);
    expect(kinds).toEqual(["listen#7", "type#7", "mc#8", "type#8"]);
    const nums = numbers();
    expect(nums).toContain(DUE_LIMIT);
    expect(DUE_LIMIT).toBe(50);
  });

  it("prefill ?word= → queue đúng 1 từ theo progress row (không đòi due)", async () => {
    dbState.queue = [
      [
        {
          wordId: 9,
          word: "w9",
          ipa: null,
          meaningVi: "n9",
          audioUrl: null,
          example: null,
        },
      ], // progress JOIN words — 1 row
      [{ meaningVi: "n9" }, { meaningVi: "nkhac" }], // pool (due rows làm pool)
    ];
    const result = await getReviewSession("u1", { wordId: 9 });
    if (!result.ok) throw new Error(result.error);
    const wordIds = [...new Set(result.steps.map((s) => s.wordId))];
    expect(wordIds).toEqual([9]);
  });

  it("prefill từ không có progress row → wordNotFound (404)", async () => {
    dbState.queue = [[]];
    const result = await getReviewSession("u1", { wordId: 404 });
    expect(result).toEqual({ ok: false, error: "wordNotFound" });
  });

  it("book không tồn tại → invalidBook; scope all (không book) bỏ qua book check", async () => {
    dbState.queue = [[]];
    expect(await getReviewSession("u1", { bookId: 9999 })).toEqual({
      ok: false,
      error: "invalidBook",
    });
    // scope all: due rows là source duy nhất, pool derive từ due rows (không
    // query thêm) — KHÔNG book check, KHÔNG subquery
    dbState.queue = [[]];
    const result = await getReviewSession("u1", {});
    if (!result.ok) throw new Error(result.error);
    expect(result.bookId).toBeNull();
    expect(result.steps).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, vnToday } from "@/lib/gamification/streak";
import { idempotencyKey } from "./vocab-xp";

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
  DISTRACTOR_POOL_LIMIT,
  DUE_LIMIT,
  getLearnSession,
  getReviewSession,
  type SessionWord,
} from "./learn-session-store";
import { LEARN_SESSION_WORDS } from "./learn-session";

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

describe("perf/query-shape §6.8 — bounded, KHÔNG load-all", () => {
  it("learn: chuỗi limit/offset ĐÚNG THỨ TỰ [1 book, 500 pool, 1 min, OFFSET chunkStart, LIMIT 10 window]", async () => {
    dbState.queue = [
      [{ id: 42 }],
      [{ meaningVi: "n" }],
      [{ order: 16 }], // min unplanted order 16
      [{ n: 15 }], // 15 từ trước → chunkStart floor(15/10)*10 = 10
      [],
    ];
    await getLearnSession("u1", 42);
    expect(numbers()).toEqual([1, 500, 1, 10, 10]);
  });

  it.each([
    [0, 0], // min ở từ đầu sách
    [1, 0], // 1 từ trước → chunk 0
    [10, 10], // 10 từ trước → chunk 1
    [23, 20], // 23 từ trước → chunk 2
  ])("OFFSET arithmetic: count %i → chunkStart %i", async (count, offset) => {
    dbState.queue = [
      [{ id: 42 }],
      [{ meaningVi: "n" }],
      [{ order: count + 1 }],
      [{ n: count }],
      [],
    ];
    await getLearnSession("u1", 42);
    const nums = numbers();
    expect(nums[3]).toBe(offset);
  });

  it("hằng số bounded pin — review 50 due / pool 500 / phiên learn 5 từ", () => {
    expect(DUE_LIMIT).toBe(50);
    expect(DISTRACTOR_POOL_LIMIT).toBe(500);
    expect(LEARN_SESSION_WORDS).toBe(5);
  });

  it("review book-scoped: chuỗi [1 book, subquery-filler, 50 due, 500 pool] — KHÔNG select toàn bảng", async () => {
    dbState.queue = [[{ id: 42 }], [], [], [{ meaningVi: "n" }]];
    await getReviewSession("u1", { bookId: 42 });
    expect(numbers()).toEqual([1, 50, 500]);
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

// ─── applyStep ────────────────────────────────────────────────────────────

const wordRow = (over: Record<string, unknown> = {}) => ({
  wordId: 7,
  word: "apple",
  meaningVi: "quả táo",
  ...over,
});
const profileRow = (over: Record<string, unknown> = {}) => ({
  xp: 10,
  streakCount: 2,
  dailyGoalWords: 5,
  ...over,
});
const activityRow = (over: Record<string, unknown> = {}) => ({
  id: 1,
  kind: "session-step",
  correct: true,
  xp: 1,
  ...over,
});
const progressRow = (over: Record<string, unknown> = {}) => ({
  ease: 2.5,
  intervalDays: 0,
  reps: 0,
  lapses: 0,
  dueAt: new Date(),
  ...over,
});
const gradeReq = (over: Record<string, unknown> = {}) => ({
  sessionKey: "sk1",
  kind: "learn" as const,
  bookId: 42,
  wordId: 7,
  stepIndex: 0,
  attemptNo: 1,
  stepKind: "type" as const,
  response: "apple",
  ...over,
});

/** Đoạn queue của MỘT awardVocabXpTx (8 query theo thứ tự impl SF-1). */
function awardQueue(
  profile: Record<string, number>,
  opts: { xpToday?: number; dailyExisting?: unknown[]; xpGain?: number } = {},
): unknown[] {
  const { xpToday = 10, dailyExisting = [], xpGain = 1 } = opts;
  const queue = [
    [{ xp: profile.xp, streakCount: profile.streakCount }],
    [{ correctToday: 0, learnComplete: 0 }],
    [{ xpToday }],
    [{ id: 1 }],
    dailyExisting,
    [],
  ];
  if (dailyExisting.length === 0) {
    queue.push([
      { date: addDays(vnToday(new Date()), -1) },
      { date: vnToday(new Date()) },
    ]);
  }
  queue.push([{ xp: profile.xp + xpGain }]);
  return queue;
}

/** insert values / update set payload — phân biệt table/column args. */
const insertPayloads = () =>
  dbState.calls.filter(
    (c): c is Record<string, unknown> =>
      typeof c === "object" && c !== null && typeof c.kind === "string",
  );
const setPayloads = () =>
  dbState.calls.filter(
    (c): c is Record<string, unknown> =>
      typeof c === "object" && c !== null && typeof c.lapses === "number",
  );

describe("applyStep — learn hoàn thành lượt (type step)", () => {
  it("từ mới reps=0 all-correct: grade q=4 reps 0→1, XP = 1 bước + 4 learn-complete, goalDone", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()], // scope: book_words JOIN words
      [], // duplicate pre-check — không có
      ...awardQueue(p, { xpToday: 10, xpGain: 1 }), // tx#1 session-step
      [{ correct: true }], // attempt corrects (type vừa ghi)
      [], // progress hiện tại — chưa có row (reps mặc định 0)
      [progressRow({ reps: 1 })], // upsert progress
      ...awardQueue({ ...p, xp: 11 }, { xpToday: 11, dailyExisting: [{ userId: "u1" }], xpGain: 4 }), // tx#2 learn-complete
      [{ n: 1 }], // count learn-complete hôm nay
      [{ dailyGoalWords: 5 }], // profile goal
    ];
    const result = await applyStep("u1", gradeReq());
    if (!result.ok) throw new Error(result.error);
    expect(result.result.correct).toBe(true);
    expect(result.result.grade).toMatchObject({
      quality: 4,
      reps: 1,
      intervalDays: 1,
      lapses: 0,
    });
    expect(typeof result.result.grade?.dueAt).toBe("string");
    expect(result.result.xpAwarded).toBe(5); // 1 (step) + 4 (learn-complete)
    expect(result.result.xpCapped).toBe(false);
    expect(result.result.totalXp).toBe(15);
    expect(result.result.streak).toBe(2);
    expect(result.result.goalDone).toBe(false); // 1 < 5
    // learn-complete ghi đúng 1 row kind riêng (idempotency không đụng step row)
    const lc = insertPayloads().filter((r) => r.kind === "learn-complete");
    expect(lc.length).toBe(1);
  });

  it("mc step (chưa hoàn thành): grade null, KHÔNG ghi progress, KHÔNG learn-complete", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()],
      [],
      ...awardQueue(p, { xpToday: 10, xpGain: 1 }),
      [{ n: 0 }], // count learn-complete
      [{ dailyGoalWords: 5 }],
    ];
    const result = await applyStep(
      "u1",
      gradeReq({ stepKind: "mc", response: "quả táo" }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.result.correct).toBe(true);
    expect(result.result.grade).toBeNull();
    expect(result.result.xpAwarded).toBe(1);
    // không upsert progress (set payload có lapses number) + không learn-complete
    expect(setPayloads().length).toBe(0);
    expect(insertPayloads().filter((r) => r.kind === "learn-complete").length).toBe(0);
  });

  it("instant-mastery regression: mc đúng rồi type đúng — reps tiến ĐÚNG 1 (không 2/3)", async () => {
    // bước mc trước: chỉ XP, không progress
    const p = profileRow();
    dbState.queue = [
      [wordRow()],
      [],
      ...awardQueue(p, { xpToday: 10 }),
      [{ n: 0 }],
      [{ dailyGoalWords: 5 }],
    ];
    const mc = await applyStep(
      "u1",
      gradeReq({ stepIndex: 0, stepKind: "mc", response: "quả táo" }),
    );
    expect(mc.ok && mc.result.grade === null).toBe(true);
    // bước type: grade MỘT lần — reps 0→1
    dbState.queue = [
      [wordRow()],
      [],
      ...awardQueue({ ...p, xp: 11 }, { xpToday: 11 }),
      [{ correct: true }, { correct: true }], // mc + type đều đúng trong attempt
      [],
      [progressRow({ reps: 1 })],
      ...awardQueue({ ...p, xp: 12 }, { xpToday: 12, dailyExisting: [{ userId: "u1" }], xpGain: 4 }),
      [{ n: 1 }],
      [{ dailyGoalWords: 5 }],
    ];
    const type = await applyStep(
      "u1",
      gradeReq({ stepIndex: 1, stepKind: "type", response: "apple" }),
    );
    if (!type.ok) throw new Error(type.error);
    expect(type.result.grade?.reps).toBe(1);
  });
});

describe("applyStep — sai bước + retry (acceptance 3)", () => {
  it("sai 1 bước trong attempt: q=0, lapses+1, reps giữ 0, KHÔNG learn-complete, xpAwarded=0", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()],
      [],
      ...awardQueue(p, { xpToday: 10, xpGain: 0 }), // sai → 0 XP
      [{ correct: false }, { correct: true }], // mc sai + type đúng
      [],
      [progressRow({ reps: 0, lapses: 1 })],
      [{ n: 0 }], // count learn-complete
      [{ dailyGoalWords: 5 }],
    ];
    const result = await applyStep("u1", gradeReq({ stepIndex: 1 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.result.correct).toBe(true); // type ĐÚNG — sai là mc trước đó
    expect(result.result.grade).toMatchObject({
      quality: 0,
      reps: 0,
      intervalDays: 1,
      lapses: 1,
    });
    expect(insertPayloads().filter((r) => r.kind === "learn-complete").length).toBe(0);
  });

  it("retry attemptNo mới all-correct: q=4, learn-complete +4 (lần đầu), XP như thường", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()],
      [],
      ...awardQueue(p, { xpToday: 10, xpGain: 1 }),
      [{ correct: true }], // attempt 2 — chỉ type của attempt này
      [],
      [progressRow({ reps: 1 })],
      ...awardQueue({ ...p, xp: 11 }, { xpToday: 11, dailyExisting: [{ userId: "u1" }], xpGain: 4 }),
      [{ n: 1 }],
      [{ dailyGoalWords: 5 }],
    ];
    const result = await applyStep(
      "u1",
      gradeReq({ attemptNo: 2, stepIndex: 1 }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.result.grade).toMatchObject({ quality: 4, reps: 1 });
    expect(result.result.xpAwarded).toBe(5);
  });

  it("review hoàn thành (reps≥1): tiến SM-2 bình thường, KHÔNG learn-complete", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()], // scope: uwp JOIN words (progress row tồn tại)
      [],
      ...awardQueue(p, { xpToday: 10 }),
      [{ correct: true }, { correct: true }],
      [progressRow({ reps: 1, intervalDays: 1 })], // đã planted
      [progressRow({ reps: 2, intervalDays: 6 })],
      [{ n: 0 }],
      [{ dailyGoalWords: 5 }],
    ];
    const result = await applyStep(
      "u1",
      gradeReq({ kind: "review", stepIndex: 1 }),
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.result.grade).toMatchObject({
      quality: 4,
      reps: 2,
      intervalDays: 6,
      lapses: 0,
    });
    expect(insertPayloads().filter((r) => r.kind === "learn-complete").length).toBe(0);
  });
});

describe("applyStep — idempotency duplicate (acceptance 4)", () => {
  it("trùng stepIndex+attemptNo: cached reconstruct, ZERO write, due/XP không đổi", async () => {
    const due = new Date("2026-10-10T00:00:00Z");
    dbState.queue = [
      [wordRow()], // scope
      [activityRow({ correct: true, xp: 1 })], // duplicate pre-check TRÚNG
      [{ xp: 15, streakCount: 2, dailyGoalWords: 5 }], // reconstruct: profile
      [{ correct: true }], // reconstruct: attempt corrects (type)
      [progressRow({ reps: 1, dueAt: due })], // reconstruct: progress — due ĐÃ ghi từ lần trước
      [{ n: 1 }], // reconstruct: count learn-complete
    ];
    const result = await applyStep("u1", gradeReq());
    if (!result.ok) throw new Error(result.error);
    expect(result.result).toMatchObject({
      correct: true,
      xpAwarded: 1, // cached từ activity row
      totalXp: 15,
      streak: 2,
      goalDone: false,
    });
    expect(result.result.grade).toMatchObject({ reps: 1, lapses: 0 });
    expect(result.result.grade?.dueAt).toBe(due.toISOString());
    // ZERO write: không insert payload mới, không update set
    expect(insertPayloads().length).toBe(0);
    expect(setPayloads().length).toBe(0);
  });

  it("race duplicate (pre-check hụt, insert conflict trong tx): reconstruct cached, không ghi SRS lần 2", async () => {
    const p = profileRow();
    dbState.queue = [
      [wordRow()],
      [], // pre-check hụt
      [{ xp: 10, streakCount: 2 }], // tx#1 lock profiles
      [{ correctToday: 0, learnComplete: 0 }],
      [{ xpToday: 10 }],
      [], // insert CONFLICT (returning rỗng)
      [activityRow({ correct: true, xp: 1 })], // lookup row đã ghi bởi tx kia
      [{ xp: 10, streakCount: 2, dailyGoalWords: 5 }], // reconstruct: profile
      [{ correct: true }], // reconstruct: attempt corrects
      [progressRow({ reps: 1 })], // reconstruct: progress
      [{ n: 1 }], // reconstruct: count learn-complete
    ];
    const result = await applyStep("u1", gradeReq());
    if (!result.ok) throw new Error(result.error);
    expect(result.result).toMatchObject({ correct: true, xpAwarded: 1, totalXp: 10 });
    expect(setPayloads().length).toBe(0); // không upsert progress lần 2
    expect(insertPayloads().filter((r) => r.kind === "learn-complete").length).toBe(0);
  });
});

describe("applyStep — scope/ownership (context pack #7)", () => {
  it("word ngoài scope + sessionKey chưa có activity → sessionNotFound", async () => {
    dbState.queue = [[], []]; // scope miss, session activity trống
    const result = await applyStep("u1", gradeReq({ wordId: 999 }));
    expect(result).toEqual({ ok: false, error: "sessionNotFound" });
  });

  it("word ngoài scope + sessionKey ĐÃ có activity → wordNotFound", async () => {
    dbState.queue = [[], [{ id: 9 }]];
    const result = await applyStep("u1", gradeReq({ wordId: 999 }));
    expect(result).toEqual({ ok: false, error: "wordNotFound" });
  });

  it("review: scope = progress row của user (không đòi due)", async () => {
    dbState.queue = [[], []];
    const result = await applyStep(
      "u1",
      gradeReq({ kind: "review", wordId: 555 }),
    );
    expect(result).toEqual({ ok: false, error: "sessionNotFound" });
  });
});

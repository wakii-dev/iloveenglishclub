import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

/**
 * Today snapshot store (daily-journey SF-2, VU-50 — spec §3.2/§3.4) — mock
 * @/db chainable + transaction (pattern vocab-xp-store.test.ts canonical).
 * Contract: fan-out Promise.all 15 chain đọc theo THỨ TỰ impl (mỗi nhánh
 * fallback-safe) → MỘT tx ghi nhỏ await TRONG snapshot: monthly grant
 * RETURNING-gated (chỉ UPDATE khi INSERT trả row — chống double-credit 2
 * tab) → quest auto-record (ON CONFLICT DO NOTHING RETURNING — reload không
 * lặp) → badge lazy-award (evalBadges trên aggregates ĐÃ gồm quest mới).
 * Tx fail → snapshot VẪN TRẢ (read đã có), log, không throw. Streak LIVE
 * freeze-aware (đọc streak_freezes — KHÔNG consume, SF-4 mới consume).
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
  calls: [] as unknown[],
  /** shape arg của db.select({...}) — mock select là function riêng (arg
   * không qua proxy chain) — ghi riêng cho SQL-pin meta-test. */
  selectShapes: [] as Record<string, unknown>[],
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
    select: (shape: Record<string, unknown>) => {
      if (shape && typeof shape === "object") dbState.selectShapes.push(shape);
      return chainOf();
    },
    selectDistinct: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
  },
}));

import { evalBadges } from "./badges";
import { QUEST_POOL, selectQuests } from "./quests";
import {
  getNextDictationTarget,
  getTodaySnapshot,
  type DictationNextCard,
} from "./today-store";
import { addDays, vnToday } from "@/lib/gamification/streak";

const today = () => vnToday(new Date());

/** plain-record guard — loại PgTable/PgColumn (args của insert/from). */
const isPayload = (c: unknown): c is Record<string, unknown> =>
  typeof c === "object" && c !== null && "userId" in (c as object);

const insertPayloads = () => dbState.calls.filter(isPayload);

/** Queue 15 nhánh fan-out theo ĐÚNG thứ tự impl (tham chiếu impl header). */
function fanoutQueue(over: Record<string, unknown> = {}) {
  const t = today();
  dbState.queue = [
    over.profile ?? [
      {
        dailyGoalMinutes: 15,
        dailyGoalWords: 5,
        shieldCredits: 1,
        streakCount: 7,
      },
    ], // 1 profiles
    over.activity ?? [
      { date: t, listenMs: 900_000, partsDone: 4 },
      { date: addDays(t, -1), listenMs: 60_000, partsDone: 1 },
    ], // 2 daily_activity lookback 400
    over.vocabAgg ?? [{ practiced: 6, planted: 3, reviewed: 3 }], // 3 vocab aggregates
    over.hubStats ?? [{ total: 40, dueToday: 2, mastered: 5 }], // 4 getHubStats
    over.dictationReading ?? [], // 5a dictation reading books
    over.continueReading ?? [], // 6a continue reading books
    over.questsToday ?? [], // 7 quest_completions hôm nay
    over.questCount ?? [{ n: 4 }], // 8 COUNT quest_completions all-time
    over.badges ?? [], // 9 user_badges đã nhận
    over.freezes ?? [], // 10 streak_freezes dates
    over.activeDays ?? [{ n: 3 }], // 11a COUNT daily_activity
    over.wordsLearned ?? [{ n: 12 }], // 11b COUNT user_word_progress reps>=1
    over.listenMsAll ?? [{ ms: 7_200_000 }], // 11c SUM duration DISTINCT parts
    over.dictationLessons ??
      [
        {
          bookId: 1,
          bookSlug: "level-1",
          unitNumber: 1,
          lessonNumber: 2,
          titleEn: "Bài 2",
          titleVi: null,
          doneParts: 1,
          totalParts: 3,
        },
      ], // 5b dictation lessons ordered + per-lesson doneParts
    over.continueBooks ?? [], // 6b continue loadBookRows
  ];
}

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  dbState.selectShapes = [];
  vi.restoreAllMocks();
});

describe("getTodaySnapshot — fan-out + shape spec §3.2", () => {
  it("trả đúng số liệu từ 15 nhánh đọc + tx ghi (grant/record/award) — snapshot toàn vẹn", async () => {
    fanoutQueue();
    // tx: grant RETURNING có row → UPDATE profiles (credits 2, cap) → quest
    // insert 3 (mọi quest done) → badge insert 5 mốc đạt
    dbState.queue.push(
      [{ userId: "u1" }], // insert shield_grants RETURNING
      [{ shieldCredits: 2 }], // update profiles RETURNING shield_credits
      selectQuests("u1", today()).map((questId) => ({ questId })), // insert quest_completions
      [
        { badgeId: "streak-3" },
        { badgeId: "streak-7" },
        { badgeId: "words-learned-10" },
        { badgeId: "listen-60" },
        { badgeId: "quests-5" },
      ], // insert user_badges
    );

    const s = await getTodaySnapshot("u1", new Date());

    expect(s).toEqual({
      date: today(),
      listenMinutesToday: 15, // 900_000ms / 60000
      dailyGoalMinutes: 15,
      practicedToday: 6,
      plantedToday: 3,
      dailyGoalWords: 5,
      partsToday: 4,
      dueToday: 2,
      reviewedToday: 3,
      streak: 2, // hôm nay + hôm qua (dates lookback)
      activeToday: true,
      goalDone: {
        minutes: { done: true, remaining: 0, pct: 100 },
        words: { done: true, remaining: 0, pct: 100 }, // 6 >= 5
        both: true,
      },
      dictationNext: {
        bookSlug: "level-1",
        unitNumber: 1,
        lessonNumber: 2,
        title: "Bài 2",
        titleVi: null,
        doneParts: 1,
        totalParts: 3,
      },
      vocabContinue: null, // loadBookRows rỗng → getContinueTarget null
      quests: selectQuests("u1", today()).map((questId) => {
        const def = QUEST_POOL.find((d) => d.questId === questId)!;
        const progress =
          def.metric === "partsToday"
            ? 4
            : def.metric === "listenGoal"
              ? 15
              : def.metric === "reviewedToday"
                ? 3
                : def.metric === "plantedToday"
                  ? 3
                  : def.metric === "practicedGoal"
                    ? 6
                    : 2; // goalDual: minutes + words đều done
        const target =
          def.target === "goalMinutes"
            ? 15
            : def.target === "goalWords"
              ? 5
              : def.target;
        return { questId, progress, target, done: progress >= target, recorded: true };
      }),
      newlyCompletedQuests: [...selectQuests("u1", today())],
      // streak-3/7 (7) · words-learned-10 (12) · listen-60 (120') · quests-5
      // (4 cũ + 3 mới = 7) — thứ tự pool
      newlyEarnedBadges: [
        "streak-3",
        "streak-7",
        "words-learned-10",
        "listen-60",
        "quests-5",
      ],
      badges: [], // read user_badges rỗng (trước award)
      shield: { credits: 2, cap: 2, freezes: [] }, // post-grant từ UPDATE returning
    });

    // grant payload đúng month 'YYYY-MM' VN
    const grantValues = insertPayloads().find((c) => "month" in c);
    expect(grantValues).toEqual({ userId: "u1", month: today().slice(0, 7) });
    // badge insert ĐÚNG pool earned (evalBadges trên questsCompleted 7)
    const badgeValues = dbState.calls.filter(
      (c) => Array.isArray(c) && (c[0] as { badgeId?: string })?.badgeId,
    );
    expect(badgeValues).toHaveLength(1);
    expect(badgeValues[0]).toHaveLength(5);
  });

  it("monthly grant RETURNING-gated: INSERT không trả row → KHÔNG update credits (chống double-credit 2 tab)", async () => {
    fanoutQueue({
      // mọi quest không done (số 0) + aggregates thấp → không insert quest/badge
      activity: [{ date: today(), listenMs: 0, partsDone: 0 }],
      vocabAgg: [{ practiced: 0, planted: 0, reviewed: 0 }],
      questCount: [{ n: 0 }],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      dictationLessons: [], // mọi bài done → dictationNext null
    });
    dbState.queue.push([]); // grant INSERT CONFLICT → RETURNING rỗng

    const s = await getTodaySnapshot("u1", new Date());

    // không có update profiles nào (.set payload có shieldCredits NUMBER —
    // select shape dùng Column object, phân biệt bằng typeof)
    const creditUpdates = dbState.calls.filter(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as { shieldCredits?: unknown }).shieldCredits === "number",
    );
    expect(creditUpdates).toHaveLength(0);
    expect(s.shield.credits).toBe(1); // giữ nguyên pre-read
    expect(s.newlyCompletedQuests).toEqual([]);
    expect(s.newlyEarnedBadges).toEqual([]);
    expect(s.dictationNext).toBeNull();
  });

  it("đã đủ cap 2: grant vẫn chèn ledger nhưng least(x+1, 2) kẹp — snapshot credits 2", async () => {
    fanoutQueue({
      activity: [{ date: today(), listenMs: 0, partsDone: 0 }],
      vocabAgg: [{ practiced: 0, planted: 0, reviewed: 0 }],
      questCount: [{ n: 0 }],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 2, streakCount: 0 },
      ],
      dictationLessons: [],
    });
    dbState.queue.push([{ userId: "u1" }], [{ shieldCredits: 2 }]);

    const s = await getTodaySnapshot("u1", new Date());
    expect(s.shield.credits).toBe(2);
    // SQL least(${shield_credits} + 1, 2) — pin có cast sql expr trong .set()
    const set = dbState.calls.find(
      (c) => typeof c === "object" && c !== null && "shieldCredits" in (c as object),
    );
    expect(set).toBeDefined();
  });

  it("quest auto-record idempotent: đã recorded hôm nay → không INSERT lần 2 (reload không lặp)", async () => {
    const [q1, q2, q3] = selectQuests("u1", today());
    fanoutQueue({
      questsToday: [q1, q2].map((questId) => ({ questId })), // 2/3 đã record (render trước)
      // MỌI metric đạt → cả 3 quest done bất kể selection hash: minutes 60≥10,
      // parts 9≥5, reviewed 9, planted 9, practiced 9≥5, dual both
      activity: [{ date: today(), listenMs: 3_600_000, partsDone: 9 }],
      vocabAgg: [{ practiced: 9, planted: 9, reviewed: 9 }],
      questCount: [{ n: 0 }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      dictationLessons: [],
    });
    dbState.queue.push([], [{ questId: q3 }]); // grant conflict + quest insert RETURNING q3
    // badges: questCount 0 + 1 mới = 1 < 5 → không badge — nhưng streak 0,
    // words 0, listen 0, activeDays 0 → evalBadges rỗng → không insert badge

    const s = await getTodaySnapshot("u1", new Date());

    const questInserts = dbState.calls.filter(
      (c) => Array.isArray(c) && (c[0] as { questId?: string })?.questId,
    );
    expect(questInserts).toHaveLength(1);
    expect(questInserts[0]).toEqual([{ userId: "u1", date: today(), questId: q3 }]);
    expect(s.newlyCompletedQuests).toEqual([q3]);
    expect(s.quests.map((q) => q.recorded)).toEqual([true, true, true]);
    expect(s.newlyEarnedBadges).toEqual([]);
  });

  it("badge quests-5 award đúng 1 lần khi ĐỦ 5 (4 cũ + 1 mới) — lần sau owned → không award lại", async () => {
    const [q1, q2, q3] = selectQuests("u1", today());
    // LẦN 1: q1,q2 recorded trước; q3 done mới → questCount 4+1 = 5 → quests-5
    fanoutQueue({
      questsToday: [q1, q2].map((questId) => ({ questId })),
      // mọi quest done (metric đạt full) → todo = [q3]
      activity: [{ date: today(), listenMs: 3_600_000, partsDone: 9 }],
      vocabAgg: [{ practiced: 9, planted: 9, reviewed: 9 }],
      questCount: [{ n: 4 }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      dictationLessons: [],
    });
    dbState.queue.push([], [{ questId: q3 }], [{ badgeId: "quests-5" }]);

    const first = await getTodaySnapshot("u1", new Date());
    expect(first.newlyEarnedBadges).toEqual(["quests-5"]);

    // LẦN 2 (reload): q3 recorded, owned có quests-5 → KHÔNG insert badge nào
    dbState.calls = [];
    fanoutQueue({
      questsToday: [q1, q2, q3].map((questId) => ({ questId })),
      activity: [{ date: today(), listenMs: 3_600_000, partsDone: 9 }],
      vocabAgg: [{ practiced: 9, planted: 9, reviewed: 9 }],
      questCount: [{ n: 5 }],
      badges: [{ badgeId: "quests-5" }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      dictationLessons: [],
    });
    dbState.queue.push([], []); // grant conflict; quest todo rỗng → không insert

    const second = await getTodaySnapshot("u1", new Date());
    const badgeInserts = dbState.calls.filter(
      (c) => Array.isArray(c) && (c[0] as { badgeId?: string })?.badgeId,
    );
    expect(badgeInserts).toHaveLength(0);
    expect(second.newlyEarnedBadges).toEqual([]);
    expect(second.newlyCompletedQuests).toEqual([]);
  });

  it("streak LIVE freeze-aware: gap hôm qua có freeze → streak still 3; KHÔNG consume freeze", async () => {
    const t = today();
    fanoutQueue({
      activity: [
        { date: t, listenMs: 0, partsDone: 1 },
        { date: addDays(t, -2), listenMs: 0, partsDone: 1 },
      ],
      freezes: [{ date: addDays(t, -1) }], // gap hôm qua được shield che
      vocabAgg: [{ practiced: 0, planted: 0, reviewed: 0 }],
      questCount: [{ n: 0 }],
      profile: [
        { dailyGoalMinutes: 10, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      activeDays: [{ n: 2 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      dictationLessons: [],
    });
    dbState.queue.push([]); // grant conflict

    const s = await getTodaySnapshot("u1", new Date());
    expect(s.streak).toBe(3); // hôm nay + freeze(hôm qua) + hôm kia
    expect(s.shield.freezes).toEqual([addDays(t, -1)]);
    // KHÔNG consume: không có INSERT streak_freezes (chỉ recomputeStreakTx SF-4)
    const freezeInserts = dbState.calls.filter(
      (c) => Array.isArray(c) && (c[0] as { date?: string })?.date !== undefined &&
        typeof (c[0] as { date?: string }).date === "string",
    );
    expect(freezeInserts).toHaveLength(0);
  });

  it("tx fail → snapshot VẪN TRẢ, log error, không throw (failWith global: reads cũng fail — worst case)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fanoutQueue();
    dbState.failWith = new Error("tx down");

    const s = await getTodaySnapshot("u1", new Date());
    // snapshot vẫn trả (fallback từng nhánh + tx catch) — KHÔNG throw
    expect(s.date).toBe(today());
    expect(s.listenMinutesToday).toBe(0);
    expect(s.practicedToday).toBe(0);
    expect(s.newlyCompletedQuests).toEqual([]);
    expect(s.newlyEarnedBadges).toEqual([]);
    expect(s.shield.credits).toBe(0);
  });

  it("mọi nhánh đọc fail → fallback zeros + goals mặc định (build-safe từng nhánh)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error("db down");

    const s = await getTodaySnapshot("u1", new Date());
    expect(s).toEqual({
      date: today(),
      listenMinutesToday: 0,
      dailyGoalMinutes: 10, // DEFAULT_GOAL_MINUTES (migration 0007 default)
      practicedToday: 0,
      plantedToday: 0,
      dailyGoalWords: 5,
      partsToday: 0,
      dueToday: 0,
      reviewedToday: 0,
      streak: 0,
      activeToday: false,
      goalDone: {
        minutes: { done: false, remaining: 10, pct: 0 },
        words: { done: false, remaining: 5, pct: 0 },
        both: false,
      },
      dictationNext: null,
      vocabContinue: null,
      quests: selectQuests("u1", today()).map((questId) => {
        const def = QUEST_POOL.find((d) => d.questId === questId)!;
        const target =
          def.target === "goalMinutes" ? 10 : def.target === "goalWords" ? 5 : def.target;
        return { questId, progress: 0, target, done: false, recorded: false };
      }),
      newlyCompletedQuests: [],
      newlyEarnedBadges: [],
      badges: [],
      shield: { credits: 0, cap: 2, freezes: [] },
    });
  });

  it("listenMinutesToday floor: 90s → 1 phút (không làm tròn lên)", async () => {
    fanoutQueue({
      activity: [{ date: today(), listenMs: 90_000, partsDone: 1 }],
      vocabAgg: [{ practiced: 0, planted: 0, reviewed: 0 }],
      questCount: [{ n: 0 }],
      profile: [
        { dailyGoalMinutes: 15, dailyGoalWords: 5, shieldCredits: 1, streakCount: 0 },
      ],
      activeDays: [{ n: 0 }],
      wordsLearned: [{ n: 0 }],
      listenMsAll: [{ ms: 0 }],
      dictationLessons: [],
    });
    dbState.queue.push([]); // grant conflict

    const s = await getTodaySnapshot("u1", new Date());
    expect(s.listenMinutesToday).toBe(1);
    // q-listen-goal: 1 < goal 15 → chưa done
    const listen = s.quests.find((q) => q.questId === "q-listen-goal");
    if (listen) {
      expect(listen.progress).toBe(1);
      expect(listen.done).toBe(false);
    }
  });
});

describe("getNextDictationTarget — resolver §3.4", () => {
  const lesson = (over: Partial<DictationNextCard> & { bookId?: number }) => ({
    bookId: over.bookId ?? 1,
    bookSlug: over.bookSlug ?? "level-1",
    unitNumber: over.unitNumber ?? 1,
    lessonNumber: over.lessonNumber ?? 1,
    titleEn: over.title ?? "Bài 1",
    titleVi: over.titleVi ?? null,
    doneParts: over.doneParts ?? 0,
    totalParts: over.totalParts ?? 2,
  });

  it("fallback toàn hệ: bài published CHƯA done ĐẦU TIÊN theo sort order", async () => {
    dbState.queue = [
      [], // reading books rỗng
      [
        lesson({ lessonNumber: 1, doneParts: 2, totalParts: 2 }), // done → bỏ
        lesson({ lessonNumber: 2, doneParts: 1, totalParts: 3 }),
        lesson({ lessonNumber: 3, doneParts: 0, totalParts: 2 }),
      ],
    ];
    const card = await getNextDictationTarget("u1");
    expect(card).toEqual({
      bookSlug: "level-1",
      unitNumber: 1,
      lessonNumber: 2,
      title: "Bài 1",
      titleVi: null,
      doneParts: 1,
      totalParts: 3,
    });
  });

  it("ưu tiên sách đang đọc: bài chưa-done trong book 5 thắng bài chưa-done sách đầu", async () => {
    dbState.queue = [
      [{ bookId: 5 }], // đang đọc level-5
      [
        lesson({ bookId: 1, bookSlug: "level-1", doneParts: 0, totalParts: 2 }),
        lesson({
          bookId: 5,
          bookSlug: "level-5",
          unitNumber: 2,
          lessonNumber: 4,
          title: "Bài 4",
          titleVi: "Bài bốn",
          doneParts: 1,
          totalParts: 2,
        }),
      ],
    ];
    const card = await getNextDictationTarget("u1");
    expect(card).toEqual({
      bookSlug: "level-5",
      unitNumber: 2,
      lessonNumber: 4,
      title: "Bài 4",
      titleVi: "Bài bốn",
      doneParts: 1,
      totalParts: 2,
    });
  });

  it("mọi sách xong (mọi bài done) → null; bài 0 part coi như done (bỏ qua)", async () => {
    dbState.queue = [
      [],
      [
        lesson({ lessonNumber: 1, totalParts: 0, doneParts: 0 }), // 0 part → skip
        lesson({ lessonNumber: 2, doneParts: 2, totalParts: 2 }), // done
      ],
    ];
    expect(await getNextDictationTarget("u1")).toBeNull();
  });

  it("DB lỗi → null (fallback-safe, không đổ snapshot)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error("db down");
    expect(await getNextDictationTarget("u1")).toBeNull();
  });
});

describe("readVocabAggregates — SQL pin (meta-test bug correlation)", () => {
  /**
   * Bug thật bắt trên DB (demo SF-2): drizzle render `${vocabActivity.userId}`
   * trong correlated subquery thành `"user_id"` KHÔNG định danh bảng →
   * `lc.user_id = "user_id"` tự tham chiếu inner table (luôn true) →
   * reviewedToday=0 khi có BẤT KỲ learn-complete nào hôm nay. Outer refs của
   * subquery PHẢI qualified `vocab_activity.*` (raw) — pin rendered SQL.
   */
  it("reviewedToday NOT EXISTS tham chiếu outer bảng QUALIFIED (vocab_activity.user_id)", async () => {
    fanoutQueue();
    dbState.queue.push([]); // grant conflict
    await getTodaySnapshot("u1", new Date());

    const selectShape = dbState.selectShapes.find((s) => "reviewed" in s) as {
      reviewed: Parameters<PgDialect["sqlToQuery"]>[0];
    };
    expect(selectShape).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(selectShape.reviewed);
    expect(rendered.sql).toContain("not exists");
    expect(rendered.sql).toContain("lc.user_id = vocab_activity.user_id");
    expect(rendered.sql).toContain("lc.word_id = vocab_activity.word_id");
    // chống regression về dạng bare "user_id" (tự tham chiếu inner)
    expect(rendered.sql).not.toContain("= \"user_id\"");
    expect(rendered.sql).not.toContain("= \"word_id\"");
  });
});

describe("evalBadges — thresholds tự kiểm (hợp đồng badge aggregates)", () => {
  it("quests-5 đạt đúng khi COUNT quest_completions >= 5", () => {
    expect(evalBadges({ streak: 0, activeDays: 0, wordsLearned: 0, listenMinutes: 0, questsCompleted: 4 })).not.toContain("quests-5");
    expect(evalBadges({ streak: 0, activeDays: 0, wordsLearned: 0, listenMinutes: 0, questsCompleted: 5 })).toContain("quests-5");
  });
});

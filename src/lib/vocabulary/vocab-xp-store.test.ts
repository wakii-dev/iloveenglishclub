import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * XP vocab DB leg (SF-1 t-4) — mock @/db chainable + transaction (pattern
 * admin vocabulary-store.test.ts + calls-recording review-store.test.ts).
 * Contract: MỘT transaction lock profiles FOR UPDATE → duplicate idempotency
 * trả cached KHÔNG ghi thêm (vocab_steps không tăng lần 2) → flags anti-farm
 * → cộng profiles.xp có điều kiện → upsert daily_activity vocab_steps →
 * streak recompute khi ngày chuyển active. 23503 → wordNotFound.
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
  awardVocabXp,
  awardVocabXpTx,
  type AwardVocabXpParams,
} from "./vocab-xp-store";
import { idempotencyKey } from "./vocab-xp";
import { vnToday } from "@/lib/gamification/streak";

const params = (over: Partial<AwardVocabXpParams> = {}): AwardVocabXpParams => ({
  userId: "u1",
  wordId: 7,
  kind: "session-step",
  correct: true,
  sessionKey: "sk-1",
  stepIndex: 0,
  attemptNo: 1,
  ...over,
});

/** Queue chuẩn theo thứ tự impl — 8 await: lock profiles → flags (user,word) → xpToday → insert activity → daily hôm nay → upsert daily → activity dates → update profiles */
function happyQueue(profile = { xp: 100, streakCount: 3 }) {
  dbState.queue = [
    [profile], // profiles FOR UPDATE
    [{ correctToday: 0, learnComplete: 0 }], // flags (user, word)
    [{ xpToday: 12 }], // tổng XP vocab hôm nay
    [{ id: 1 }], // insert vocab_activity RETURNING — không conflict
    [], // daily_activity hôm nay CHƯA có
    [], // upsert daily_activity (kết quả không dùng)
    [{ date: "2026-10-07" }, { date: "2026-10-08" }, { date: "2026-10-09" }], // 3 ngày liên tiếp → streak 3
    [{ xp: 101 }], // update profiles RETURNING xp
  ];
}

/** Arg .set() của update profiles — phân biệt với select shape {xp, streakCount} bằng lastActiveDate. */
const profileSetCall = () =>
  dbState.calls.filter(
    (c): c is Record<string, unknown> =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as { streakCount?: unknown }).streakCount === "number", // chỉ .set() có streakCount là number (table/select = Column object)
  );

/** plain-record guard — loại PgTable/PgColumn (args của insert(table)/from(table)). */
const isPayload = (c: unknown): c is Record<string, unknown> =>
  typeof c === "object" && c !== null && typeof (c as { userId?: unknown }).userId === "string";

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("awardVocabXpTx — MỘT transaction", () => {
  it("bước đúng lần đầu: XP +1, ghi activity, vocab_steps +1, streak recompute ngày active", async () => {
    happyQueue();
    const result = await awardVocabXpTx(txMock() as never, params());

    expect(result).toMatchObject({
      duplicate: false,
      xpAwarded: 1,
      xpCapped: false,
      totalXp: 101,
      streak: 3, // 08→09 liên tiếp
    });

    // insert vocab_activity: idempotency server-derive + đúng payload
    const insertValues = dbState.calls.find(
      (c) => isPayload(c) && "idempotencyKey" in c,
    ) as Record<string, unknown>;
    expect(insertValues).toMatchObject({
      userId: "u1",
      wordId: 7,
      kind: "session-step",
      correct: true,
      xp: 1,
      sessionKey: "sk-1",
      stepIndex: 0,
      attemptNo: 1,
    });
    expect(insertValues.idempotencyKey).toBe(idempotencyKey("u1", "sk-1", 7, 0, 1));

    // upsert daily_activity: vocab_steps +1, date theo VN
    const activityValues = dbState.calls.find(
      (c) => isPayload(c) && "vocabSteps" in c,
    ) as Record<string, unknown>;
    expect(activityValues).toMatchObject({
      userId: "u1",
      date: vnToday(new Date()),
      vocabSteps: 1,
    });

    // profiles update: có cộng xp (sql expr) + lastActiveDate
    const sets = profileSetCall();
    expect(sets).toHaveLength(1);
    expect(sets[0].lastActiveDate).toBe(vnToday(new Date()));
  });

  it("duplicate idempotency (insert conflict → returning rỗng): trả cached, KHÔNG ghi gì thêm", async () => {
    happyQueue();
    dbState.queue[3] = []; // ON CONFLICT DO NOTHING → rỗng
    const result = await awardVocabXpTx(txMock() as never, params());

    expect(result).toMatchObject({
      duplicate: true,
      xpAwarded: 0,
      totalXp: 100, // giữ nguyên profile
    });
    // không có update profiles (.set streakCount+lastActiveDate) sau khi duplicate
    expect(profileSetCall()).toHaveLength(0);
  });

  it("lặp từ đã-correct-hôm-nay: 0 XP nhưng vẫn ghi audit + vocab_steps +1 (presence streak)", async () => {
    happyQueue();
    dbState.queue[1] = [{ correctToday: 2, learnComplete: 0 }];
    const result = await awardVocabXpTx(txMock() as never, params());
    expect(result).toMatchObject({ duplicate: false, xpAwarded: 0, xpCapped: false });
    // activity vẫn ghi (audit completeness)
    const insertValues = dbState.calls.find(
      (c) => isPayload(c) && "idempotencyKey" in c,
    ) as Record<string, unknown>;
    expect(insertValues.xp).toBe(0);
  });

  it("learn-complete lần đầu: +4 XP", async () => {
    happyQueue({ xp: 100, streakCount: 0 });
    dbState.queue[6] = [{ date: vnToday(new Date()) }]; // chỉ hôm nay active → streak 1
    dbState.queue[7] = [{ xp: 104 }]; // update returning: 100 + 4
    const result = await awardVocabXpTx(
      txMock() as never,
      params({ kind: "learn-complete" }),
    );
    expect(result).toMatchObject({ xpAwarded: 4, totalXp: 104, streak: 1 });
  });

  it("learn-complete đã tồn tại: 0 XP, không cộng profiles", async () => {
    happyQueue();
    dbState.queue[1] = [{ correctToday: 0, learnComplete: 1 }];
    const result = await awardVocabXpTx(
      txMock() as never,
      params({ kind: "learn-complete" }),
    );
    expect(result).toMatchObject({ xpAwarded: 0 });
    const insertValues = dbState.calls.find(
      (c) => isPayload(c) && "idempotencyKey" in c,
    ) as Record<string, unknown>;
    expect(insertValues.xp).toBe(0);
  });

  it("cap: vocabXpToday đã 60 → đúng vẫn 0 XP + xpCapped=true, vocab_steps vẫn +1 (SRS tiến đầy đủ là việc SF-2)", async () => {
    happyQueue();
    dbState.queue[2] = [{ xpToday: 60 }];
    const result = await awardVocabXpTx(txMock() as never, params());
    expect(result).toMatchObject({ xpAwarded: 0, xpCapped: true });
  });

  it("ngày đã active (daily row tồn tại): KHÔNG recompute streak — giữ cache", async () => {
    happyQueue();
    dbState.queue[4] = [{ userId: "u1", date: vnToday(new Date()) }]; // đã có
    // nếu code vẫn nhánh recompute → select dates ăn item update-profiles → xp sai shape
    dbState.queue[6] = [{ date: "2019-01-01" }];
    const result = await awardVocabXpTx(txMock() as never, params());
    // profile.streakCount giữ nguyên (3) — nhánh recompute không chạy
    expect(result.streak).toBe(3);
  });

  it("profiles không tồn tại → noProfile, không ghi gì", async () => {
    dbState.queue = [[]]; // profiles FOR UPDATE rỗng
    const result = await awardVocabXpTx(txMock() as never, params());
    expect(result).toEqual({
      duplicate: false,
      xpAwarded: 0,
      xpCapped: false,
      totalXp: 0,
      streak: 0,
      error: "noProfile",
    });
  });
});

describe("awardVocabXp — wrapper tự mở transaction", () => {
  it("FK 23503 (word không tồn tại) → wordNotFound", async () => {
    dbState.failWith = { code: "23503" };
    const result = await awardVocabXp(params());
    expect(result).toEqual({
      duplicate: false,
      xpAwarded: 0,
      xpCapped: false,
      totalXp: 0,
      streak: 0,
      error: "wordNotFound",
    });
  });

  it("lỗi lạ → rethrow (không nuốt — SF-2 route sở hữu taxonomy)", async () => {
    dbState.failWith = new Error("boom");
    await expect(awardVocabXp(params())).rejects.toThrow("boom");
  });
});

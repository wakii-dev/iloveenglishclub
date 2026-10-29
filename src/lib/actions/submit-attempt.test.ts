import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * submitAttempt — dictation write-path (SF-6 ban đầu; SF-4 VU-52 rewire
 * streak). Mock @/auth + @/db chainable (pattern vocab-xp-store.test.ts).
 * Pin CONTRACT SF-4: recompute qua recomputeStreakTx — identity 0 credit +
 * 0 freeze ⇒ byte-identical computeStreak thuần (không freeze-write);
 * consume 1 credit + gap hôm qua ⇒ freeze hôm-qua + credits −1 + streak
 * bắc cầu; gate isFirstToday giữ nguyên (attempt lại cùng part ⇒ giữ cache).
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  calls: [] as unknown[],
}));

const authState = vi.hoisted(() => ({ userId: "u1" as string | null }));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const proxy: unknown = new Proxy(function chain() {}, {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return Promise.resolve(result).then.bind(Promise.resolve(result));
      if (prop === "catch") return Promise.resolve(result).catch.bind(Promise.resolve(result));
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

vi.mock("@/auth", () => ({
  auth: async () =>
    authState.userId ? { user: { id: authState.userId } } : null,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
    insert: () => chainOf(),
    update: () => chainOf(),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(txMock()),
  },
}));

import { submitAttempt } from "./submit-attempt";
import { addDays, vnToday } from "@/lib/gamification/streak";

const TODAY = vnToday(new Date()); // derive từ đồng hồ thật — không time-bomb

/** Queue chuẩn happy-path: part → profile → counts → insert attempts → daily upsert → [recompute:] dates → freezes → credits → update profiles → progress upsert. */
function happyQueue(opts?: {
  counts?: { total: number; todayCount: number };
  dates?: string[];
  freezes?: string[];
  credits?: number;
  consume?: boolean;
}) {
  dbState.queue = [
    [{ id: 1, lessonId: 5, text: "hello world", durationMs: 60000, published: true }],
    [{ xp: 100, streakCount: 0, relaxedMode: false }], // profiles FOR UPDATE
    [opts?.counts ?? { total: 0, todayCount: 0 }], // counts isFirst/isFirstToday
    [{ id: 99 }], // insert attempts RETURNING — không duplicate
    [], // upsert daily_activity (kết quả không dùng)
    (opts?.dates ?? [addDays(TODAY, -1), TODAY]).map((date) => ({ date })), // activity dates — select trả rows {date}
    (opts?.freezes ?? []).map((date) => ({ date })), // streak_freezes rows
    [{ shieldCredits: opts?.credits ?? 0 }], // shield_credits
    ...(opts?.consume ? [[], []] : []), // insert freezes + update credits (kết quả không dùng)
    [{ xp: 110 }], // update profiles RETURNING xp
    [], // upsert user_lesson_progress
  ];
}

afterEach(() => {
  dbState.queue = [];
  dbState.calls = [];
  authState.userId = "u1";
});

const freezeInsertDates = (): string[] =>
  dbState.calls
    .filter(
      (c) =>
        Array.isArray(c) &&
        c.length > 0 &&
        typeof (c[0] as { date?: unknown }).date === "string" &&
        !("bestAccuracy" in (c[0] as object)) &&
        !("doneParts" in (c[0] as object)),
    )
    .flat()
    .map((r) => (r as { date: string }).date);

const input = () => ({
  partId: 1,
  typedText: "hello world", // khớp part.text → accuracy 1
  usedHint: false,
  clientAttemptId: "0f0e0d0c-0b0a-49f8-8765-4321098765fe",
});

describe("submitAttempt — SF-4 streak rewire", () => {
  it("identity: 0 credit + 0 freeze → streak = computeStreak thuần, KHÔNG freeze-write", async () => {
    happyQueue({ dates: [addDays(TODAY, -2), TODAY] }); // gap hôm qua

    const result = await submitAttempt(input());

    expect(result).toMatchObject({ ok: true, streak: 1 }); // gap không bắc cầu
    expect(freezeInsertDates()).toHaveLength(0);
  });

  it("identity: ngày liên tiếp đủ → streak đúng", async () => {
    happyQueue(); // hôm qua + hôm nay

    const result = await submitAttempt(input());

    expect(result.streak).toBe(2);
    expect(freezeInsertDates()).toHaveLength(0);
  });

  it("consume: 1 credit + gap hôm qua → freeze hôm-qua, credits −1, streak bắc cầu", async () => {
    happyQueue({
      dates: [addDays(TODAY, -2), TODAY],
      freezes: [],
      credits: 1,
      consume: true,
    });

    const result = await submitAttempt(input());

    expect(result.streak).toBe(3); // hôm-nay-kia + freeze + hôm nay
    expect(freezeInsertDates()).toEqual([addDays(TODAY, -1)]);
  });

  it("gate: attempt lại cùng part hôm nay (isFirstToday=false) → KHÔNG recompute, giữ cache", async () => {
    happyQueue({ counts: { total: 1, todayCount: 1 }, dates: [addDays(TODAY, -1), TODAY] });
    // ngày đã active → daily upsert vẫn chạy, nhưng recompute không ăn queue
    // dates — nếu code nhánh sai, dates select ăn update-profiles → shape sai

    const result = await submitAttempt(input());

    expect(result.ok).toBe(true);
    expect(result.streak).toBe(0); // profile.streakCount từ queue
    // queue còn dư dates/freezes/credits — nhánh recompute không chạy
    expect(dbState.queue.length).toBeGreaterThanOrEqual(3);
  });

  it("unauthorized → error, không đụng DB", async () => {
    authState.userId = null;
    const result = await submitAttempt(input());
    expect(result).toMatchObject({ ok: false, error: "unauthorized" });
    expect(dbState.calls).toHaveLength(0);
  });
});

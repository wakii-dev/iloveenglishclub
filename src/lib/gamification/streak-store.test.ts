import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * recomputeStreakTx (daily-journey SF-4, VU-52 — context pack §1): owner
 * DUY NHẤT tạo freeze rows — mock @/db chainable (pattern vocab-xp-store
 * .test.ts). Contract: caller giữ profiles FOR UPDATE → đọc activity ∪
 * freezes ∪ credits → planFreezes (SF-1 pure) → INSERT streak_freezes
 * idempotent + UPDATE shield_credits → computeStreak với FREEZE SET ĐẦY ĐỦ
 * (cũ + mới). Identity: 0 credit + 0 freeze ⇒ byte-identical computeStreak
 * thuần, không insert/update thừa.
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

import { recomputeStreakTx } from "./streak-store";
import { addDays, computeStreak, vnToday } from "./streak";

const TODAY = vnToday(new Date()); // derive từ đồng hồ thật — không time-bomb

type DateRow = { date: string };

/** Queue chuẩn recomputeStreakTx: activity dates → freezes → credits (+ insert/update khi có freeze mới). */
function queue(dates: string[], freezes: string[], credits: number): void {
  dbState.queue = [
    dates.map((date) => ({ date })), // daily_activity desc
    freezes.map((date) => ({ date })), // streak_freezes
    [{ shieldCredits: credits }], // profiles.shield_credits
  ];
}

const plainRecords = (c: unknown): c is Record<string, unknown> =>
  typeof c === "object" && c !== null && !Array.isArray(c);

/** Mọi ngày trong các .values() payload của insert streak_freezes (mảng rows). */
const insertedFreezeDates = (): string[] =>
  dbState.calls
    .filter(
      (c): c is Record<string, unknown>[] =>
        Array.isArray(c) &&
        c.length > 0 &&
        c.every(
          (r) =>
            plainRecords(r) &&
            typeof r.userId === "string" &&
            typeof r.date === "string" &&
            (r.date as string).length === 10,
        ),
    )
    .flat()
    .map((r) => r.date as string);

/** .set() payload của update profiles (shieldCredits number). */
const creditSetCalls = () =>
  dbState.calls.filter(
    (c): c is Record<string, unknown> =>
      plainRecords(c) &&
      typeof c.shieldCredits === "number" &&
      !("xp" in c),
  );

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("recomputeStreakTx — identity (0 credit + 0 freeze)", () => {
  it("byte-identical computeStreak thuần + KHÔNG insert/update", async () => {
    const dates = [addDays(TODAY, -2), TODAY]; // gap hôm qua
    queue(dates, [], 0);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    // gap hôm qua KHÔNG được bắc cầu khi không có freeze — streak 1
    expect(streak).toBe(computeStreak(dates, TODAY));
    expect(streak).toBe(1);
    expect(insertedFreezeDates()).toHaveLength(0);
    expect(creditSetCalls()).toHaveLength(0);
  });

  it("ngày liên tiếp đủ → streak đúng, không write", async () => {
    const dates = [addDays(TODAY, -1), TODAY];
    queue(dates, [], 0);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    expect(streak).toBe(2);
    expect(insertedFreezeDates()).toHaveLength(0);
    expect(creditSetCalls()).toHaveLength(0);
  });

  it("freeze cũ vẫn có tác dụng bridge kể cả 0 credit", async () => {
    // freeze hôm qua tồn tại sẵn + activity hôm-nay-kia + hôm nay → 3
    const dates = [addDays(TODAY, -2), TODAY];
    queue(dates, [addDays(TODAY, -1)], 0);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    expect(streak).toBe(3);
  });
});

describe("recomputeStreakTx — consume", () => {
  it("1 credit + gap hôm qua → freeze hôm qua, credits −1, streak bắc cầu", async () => {
    const yesterday = addDays(TODAY, -1);
    const dates = [addDays(TODAY, -2), TODAY];
    queue(dates, [], 1);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    expect(streak).toBe(3); // hôm-nay-kia + freeze hôm-qua + hôm nay
    expect(insertedFreezeDates()).toEqual([yesterday]);
    expect(creditSetCalls()).toEqual([{ shieldCredits: 0 }]);
  });

  it("freeze-merge contract: gap đã freeze cũ KHÔNG bị plan lại (chống double-burn)", async () => {
    // daily_activity thiếu today-1 lẫn today-2, nhưng today-2 ĐÃ freeze từ
    // lần recompute trước — plan lại today-2 thì INSERT no-op PK nhưng
    // credits bị trừ lần 2. Union dates ⇒ planner skip today-2, walk tiếp:
    // freeze today-1 + today-3 (cap 2, đúng semantics planFreezes SF-1).
    const dates = [TODAY];
    const oldFreeze = addDays(TODAY, -2);
    queue(dates, [oldFreeze], 2);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    // today-3 freeze mới + today-2 freeze cũ + today-1 freeze mới + hôm nay
    expect(streak).toBe(4);
    const frozen = insertedFreezeDates();
    expect(frozen).toHaveLength(2);
    expect(frozen).not.toContain(oldFreeze); // KHÔNG re-freeze ngày cũ
    // đúng 2 credits tiêu cho 2 freeze MỚI — không burn thừa
    expect(creditSetCalls()).toEqual([{ shieldCredits: 0 }]);
  });

  it("window chỉ toàn ngày active hiệu lực + 0 credit → plan rỗng, KHÔNG write", async () => {
    // 2 gap window đều đã freeze, credits 0 — recompute lặp không burn:
    // planner không có credit ⇒ không freeze thêm ngày nào ngoài window
    const dates = [TODAY];
    queue(dates, [addDays(TODAY, -1), addDays(TODAY, -2)], 0);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    expect(streak).toBe(3);
    expect(insertedFreezeDates()).toHaveLength(0);
    expect(creditSetCalls()).toHaveLength(0);
  });

  it("cap 2 freeze/call + theo credits: 5 credit, 3 gap → freeze 2 gần nhất", async () => {
    const dates = [TODAY];
    queue(dates, [], 5);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    // freeze hôm-qua + hôm-nay-kia (2 gần nhất) → streak dừng ở today-3
    expect(streak).toBe(3);
    expect(insertedFreezeDates().sort()).toEqual([
      addDays(TODAY, -2),
      addDays(TODAY, -1),
    ]);
    expect(creditSetCalls()).toEqual([{ shieldCredits: 3 }]);
  });

  it("credits ít hơn gap → freeze theo số credit còn", async () => {
    const dates = [TODAY];
    queue(dates, [], 1);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    expect(streak).toBe(2); // hôm qua freeze + hôm nay; today-2 vẫn hở
    expect(insertedFreezeDates()).toEqual([addDays(TODAY, -1)]);
    expect(creditSetCalls()).toEqual([{ shieldCredits: 0 }]);
  });

  it("insert nhiều freeze 1 statement — idempotent onConflictDoNothing theo contract", async () => {
    const dates = [TODAY];
    queue(dates, [], 2);

    await recomputeStreakTx(txMock() as never, "u1", TODAY);

    // .values() nhận MẢNG rows — ĐÚNG 1 insert statement cho 2 ngày
    const rowArrays = dbState.calls.filter(
      (c): c is Record<string, unknown>[] =>
        Array.isArray(c) &&
        c.length > 0 &&
        plainRecords(c[0]!) &&
        typeof (c[0] as { date?: unknown }).date === "string",
    );
    expect(rowArrays).toHaveLength(1);
    expect(rowArrays[0]).toHaveLength(2);
  });

  it("hồ sâu hơn lookback 7 không bị freeze — hố không bắc cầu", async () => {
    const dates = [addDays(TODAY, -9), TODAY];
    queue(dates, [], 1);

    const streak = await recomputeStreakTx(txMock() as never, "u1", TODAY);

    // 1 credit CHỈ freeze hôm-qua (creditsLeft 0 ⇒ planner dừng) — hố
    // today-2..today-8 KHÔNG được đụng dù lookback window còn; streak
    // bắc cầu đúng 1 ngày freeze = 2
    expect(streak).toBe(2);
    expect(insertedFreezeDates()).toEqual([addDays(TODAY, -1)]);
  });
});

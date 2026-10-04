import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Store kế hoạch ngày (story vocabulary-learn t-1.5) — mock @/db chainable
 * (pattern hub-store.test.ts): select 3 cột (reps/dueAt/lastReviewedAt) của
 * user_word_progress rồi buildDailyPlan; limit lớn chặn phình (book seed cả
 * nghìn từ); DB lỗi (bảng chưa migrate) → EMPTY_DAILY_PLAN build-safe.
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

vi.mock("@/db", () => ({
  db: {
    select: () => chainOf(),
  },
}));

import { EMPTY_DAILY_PLAN } from "./daily-plan";
import { getDailyPlan } from "./daily-plan-store";

const NOW = new Date("2026-10-04T03:00:00.000Z");

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
  dbState.calls = [];
  vi.restoreAllMocks();
});

describe("getDailyPlan", () => {
  it("rows từ DB → buildDailyPlan tính đúng (2 mới due + 1 ôn due, streak 1)", async () => {
    dbState.queue = [
      [
        { reps: 0, dueAt: new Date("2026-10-04T02:00:00.000Z"), lastReviewedAt: null },
        { reps: 0, dueAt: new Date("2026-10-04T02:30:00.000Z"), lastReviewedAt: null },
        {
          reps: 2,
          dueAt: new Date("2026-10-04T01:00:00.000Z"),
          lastReviewedAt: new Date("2026-10-04T02:00:00.000Z"),
        },
        {
          reps: 0,
          dueAt: new Date("2026-10-05T03:00:00.000Z"),
          lastReviewedAt: null,
        },
      ],
    ];
    const plan = await getDailyPlan("u1", NOW);
    expect(plan).toMatchObject({
      newDue: 2,
      reviewDue: 1,
      totalDue: 3,
      upcoming: 1,
      total: 4,
      streakDays: 1,
    });
    // limit chống phình luôn đặt
    expect(dbState.calls).toContain(5000);
  });

  it("không có progress → EMPTY_DAILY_PLAN", async () => {
    dbState.queue = [[]];
    expect(await getDailyPlan("u1", NOW)).toEqual(EMPTY_DAILY_PLAN);
  });

  it("DB lỗi (bảng chưa migrate) → EMPTY_DAILY_PLAN + log, không throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error('relation "user_word_progress" does not exist');
    expect(await getDailyPlan("u1", NOW)).toEqual(EMPTY_DAILY_PLAN);
  });
});

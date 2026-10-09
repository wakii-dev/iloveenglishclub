import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Dashboard aggregate store (vocab-memrise SF-4, VU-41) — mock @/db chainable
 * (pattern vocab-xp-store.test.ts). Contract context pack sf-4.md:
 *  - plantedToday = count vocab_activity kind='learn-complete' NGÀY VN (vnToday)
 *  - streak/activeToday derive từ daily_activity (source of truth) + computeStreak
 *  - garden distribution SQL-side theo boundary growth.ts — gardenStageBucket
 *    sweep đối chiếu growthStage() chống drift (KHÔNG sửa lib SF-1)
 *  - continue target ưu tiên sách đang đọc, fallback sách đầu còn từ chưa
 *    planted (sortOrder); MỌI sách planted hết → completed:true (không link)
 *  - DB lỗi → fallback 0/rỗng build-safe như hub-store
 */
const dbState = vi.hoisted(() => ({
  queue: [] as unknown[],
  failWith: null as unknown,
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
      return () => proxy;
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
    selectDistinct: () => chainOf(),
    update: () => chainOf(),
  },
}));

import { growthStage } from "./growth";
import { WORDS_PER_LEVEL } from "./levels";
import {
  gardenStageBucket,
  getBookLevelProgresses,
  getContinueTarget,
  getDashboardSummary,
  getGardenDistribution,
  stageBoundFilter,
  updateDailyGoal,
} from "./dashboard-store";
import { addDays, vnToday } from "@/lib/gamification/streak";

const today = () => vnToday(new Date());

afterEach(() => {
  dbState.queue = [];
  dbState.failWith = null;
});

describe("gardenStageBucket — drift-guard chống growth.ts", () => {
  it("bucket SQL khớp growthStage trên sweep reps × intervalDays", () => {
    for (const reps of [0, 1, 3]) {
      for (let intervalDays = 0; intervalDays <= 250; intervalDays++) {
        expect(gardenStageBucket({ reps, intervalDays })).toBe(
          growthStage({ reps, intervalDays }),
        );
      }
    }
  });
});

describe("stageBoundFilter — bounds SQL khớp growthStage (P0 review A)", () => {
  /**
   * Sweep bounds SẼ ĐỦNG dùng cho SQL filter: mỗi stage 1..7 là nửa khoảng
   * [lower, upper) — mọi interval chỉ rơi vào ĐÚNG 1 stage, trùng
   * growthStage(). Đỏ trên code cũ s1=[2,7) (interval 0-1 không vào bucket
   * nào) và s7 undefined (bucket 7 luôn rỗng).
   */
  function stageMatch({
    reps,
    intervalDays,
  }: {
    reps: number;
    intervalDays: number;
  }): number {
    if (reps <= 0) return 0;
    for (let stage = 1; stage <= 7; stage++) {
      const { lower, upper } = stageBoundFilter(stage);
      const days = Math.max(0, intervalDays);
      if (days >= (lower ?? 0) && (upper === null || days < upper)) {
        return stage;
      }
    }
    return -1; // interval không rơi bucket nào → sweep bắt ngay
  }

  it("mọi interval rơi ĐÚNG 1 bucket và khớp growthStage", () => {
    for (const reps of [0, 1, 3]) {
      for (let intervalDays = 0; intervalDays <= 250; intervalDays++) {
        expect(stageMatch({ reps, intervalDays })).toBe(
          growthStage({ reps, intervalDays }),
        );
      }
    }
  });

  it("biên cụ thể: s1 <2 · s2 [2,7) · s6 [100,200) · s7 >=200", () => {
    expect(stageBoundFilter(1)).toEqual({ lower: null, upper: 2 });
    expect(stageBoundFilter(2)).toEqual({ lower: 2, upper: 7 });
    expect(stageBoundFilter(6)).toEqual({ lower: 100, upper: 200 });
    expect(stageBoundFilter(7)).toEqual({ lower: 200, upper: null });
  });
});

describe("getDashboardSummary", () => {
  function summaryQueue(over: Record<string, unknown> = {}) {
    dbState.queue = [
      [{ planted: over.planted ?? 3 }], // count learn-complete hôm nay
      [
        {
          dailyGoalWords: over.goal ?? 5,
          xp: over.xp ?? 1248,
          streakCount: over.streakCache ?? 7,
        },
      ], // profiles
      over.dates ?? [{ date: today() }, { date: addDays(today(), -1) }], // daily_activity 400 ngày
      [{ total: 2, dueToday: over.due ?? 12, mastered: 1 }], // getHubStats
    ];
  }

  it("đếm planted-today + streak presence + due — shape đủ 6 số", async () => {
    summaryQueue();
    const s = await getDashboardSummary("u1", new Date());
    expect(s).toEqual({
      plantedToday: 3,
      dailyGoalWords: 5,
      totalXp: 1248,
      streak: 2,
      activeToday: true,
      dueToday: 12,
    });
  });

  it("chưa học hôm nay — streak vẫn còn từ hôm qua, activeToday false", async () => {
    summaryQueue({
      dates: [{ date: addDays(today(), -1) }, { date: addDays(today(), -2) }],
    });
    const s = await getDashboardSummary("u1", new Date());
    expect(s.streak).toBe(2);
    expect(s.activeToday).toBe(false);
  });

  it("không có profile (row rỗng) → mặc định goal 5, xp 0", async () => {
    dbState.queue = [[{ planted: 0 }], [], [], [{ total: 0, dueToday: 0, mastered: 0 }]];
    const s = await getDashboardSummary("u1", new Date());
    expect(s.dailyGoalWords).toBe(5);
    expect(s.totalXp).toBe(0);
    expect(s.streak).toBe(0);
  });

  it("DB lỗi → fallback zeros (build-safe như hub-store)", async () => {
    dbState.failWith = new Error("db down");
    const s = await getDashboardSummary("u1", new Date());
    expect(s).toEqual({
      plantedToday: 0,
      dailyGoalWords: 5,
      totalXp: 0,
      streak: 0,
      activeToday: false,
      dueToday: 0,
    });
  });
});

describe("getGardenDistribution", () => {
  it("trả 8 bucket theo SQL counts, đúng thứ tự stage 0..7", async () => {
    dbState.queue = [
      [{ s0: 96, s1: 74, s2: 58, s3: 34, s4: 22, s5: 15, s6: 8, s7: 6 }],
    ];
    expect(await getGardenDistribution("u1")).toEqual([
      96, 74, 58, 34, 22, 15, 8, 6,
    ]);
  });

  it("DB lỗi → toàn 0 (8 phần tử, component không crash)", async () => {
    dbState.failWith = new Error("db down");
    expect(await getGardenDistribution("u1")).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

// rows (book, order, reps) JOIN sẵn — shape input của continue + levels progress
type Row = {
  bookId: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  cefrLabel: string;
  order: number;
  reps: number | null;
};

function rowsQueue(rows: Row[]) {
  dbState.queue = [rows];
}

function rowsQueueWithReading(rows: Row[], reading: number[]) {
  dbState.queue = [reading.map((bookId) => ({ bookId })), rows];
}

describe("getContinueTarget", () => {
  const b1 = (over: Partial<Row> = {}): Row => ({
    bookId: 5,
    slug: "level-5",
    titleEn: "Prepare 5",
    titleVi: null,
    cefrLabel: "B1",
    order: 1,
    reps: 0,
    ...over,
  });

  it("sách đang đọc + chunk đầu còn reps=0 → target level đúng", async () => {
    // book 5: 12 từ — order 1..10 planted hết, order 11-12 chưa (level 2 dở)
    const rows = Array.from({ length: 12 }, (_, i) =>
      b1({ order: i + 1, reps: i < 10 ? 1 : 0 }),
    );
    rowsQueueWithReading(rows, [5]);
    const target = await getContinueTarget("u1");
    expect(target).not.toBeNull();
    expect(target && target.completed).toBe(false);
    if (!target || target.completed) return;
    expect(target.slug).toBe("level-5");
    expect(target.level.levelIndex).toBe(1); // level 2 (0-based 1)
    expect(target.level.words).toHaveLength(2);
  });

  it("không có sách đang đọc → fallback sách ĐẦU còn từ chưa planted theo sortOrder", async () => {
    const rows = [
      { ...b1({ bookId: 2, slug: "level-2", order: 1, reps: 1 }) }, // book 2 hết
      { ...b1({ bookId: 5, slug: "level-5", order: 1, reps: 0 }) }, // book 5 còn
    ];
    rowsQueueWithReading(rows, []); // chưa đọc sách nào
    const target = await getContinueTarget("u1");
    if (!target || target.completed) return expect.unreachable();
    expect(target.slug).toBe("level-5");
  });

  it("sách đang đọc planted hết nhưng sách khác còn → nhảy sách còn", async () => {
    const rows = [
      { ...b1({ bookId: 5, slug: "level-5", order: 1, reps: 1 }) },
      { ...b1({ bookId: 6, slug: "level-6", order: 1, reps: 0 }) },
    ];
    rowsQueueWithReading(rows, [5]);
    const target = await getContinueTarget("u1");
    if (!target || target.completed) return expect.unreachable();
    expect(target.slug).toBe("level-6");
  });

  it("MỌI sách planted hết → completed + meta sách cuối (không link rỗng)", async () => {
    const rows = [b1({ reps: 1 })];
    rowsQueueWithReading(rows, [5]);
    const target = await getContinueTarget("u1");
    expect(target && target.completed).toBe(true);
    if (!target || !target.completed) return;
    expect(target.slug).toBe("level-5"); // meta sách cuối giữ cho card render
  });

  it("chunk theo VỊ TRÍ order-sorted (semantics levels.ts) — WORDS_PER_LEVEL 10", async () => {
    expect(WORDS_PER_LEVEL).toBe(10);
    const rows = Array.from({ length: 10 }, (_, i) => b1({ order: i + 1, reps: 1 }));
    rowsQueueWithReading(rows, [5]);
    const target = await getContinueTarget("u1");
    expect(target && target.completed).toBe(true);
  });

  it("DB lỗi → null (component render empty, không crash)", async () => {
    dbState.failWith = new Error("db down");
    expect(await getContinueTarget("u1")).toBeNull();
  });
});

describe("updateDailyGoal", () => {
  it("update profiles trả dailyGoalWords mới → { ok: true }", async () => {
    dbState.queue = [[{ dailyGoalWords: 10 }]];
    expect(await updateDailyGoal("u1", 10)).toEqual({
      ok: true,
      dailyGoalWords: 10,
    });
  });

  it("DB lỗi → { ok: false } (route map 500 generic)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    dbState.failWith = new Error("db down");
    expect(await updateDailyGoal("u1", 10)).toEqual({ ok: false });
  });
});

describe("getBookLevelProgresses", () => {
  it("group per book + levelProgress đúng planted/tổng per level", async () => {
    const rows: Row[] = [
      { bookId: 2, slug: "level-2", titleEn: "Prepare 2", titleVi: null, cefrLabel: "A1", order: 1, reps: 1 },
      { bookId: 2, slug: "level-2", titleEn: "Prepare 2", titleVi: null, cefrLabel: "A1", order: 2, reps: 0 },
      { bookId: 5, slug: "level-5", titleEn: "Prepare 5", titleVi: "Sách 5", cefrLabel: "B1", order: 1, reps: 1 },
    ];
    rowsQueue(rows);
    const books = await getBookLevelProgresses("u1");
    expect(books).toHaveLength(2);
    expect(books[0]?.slug).toBe("level-2");
    expect(books[0]?.progress.levels).toEqual([
      { levelIndex: 0, planted: 1, total: 2 },
    ]);
    expect(books[0]?.progress.planted).toBe(1);
    expect(books[1]?.titleVi).toBe("Sách 5");
    expect(books[1]?.progress.planted).toBe(1);
  });

  it("DB lỗi → [] (build-safe)", async () => {
    dbState.failWith = new Error("db down");
    expect(await getBookLevelProgresses("u1")).toEqual([]);
  });
});

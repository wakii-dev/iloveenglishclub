import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * readMyStats +goalDone (daily-journey SF-3, VU-51 — context pack §3 +
 * spec §2.6): shape mở rộng {xp, streak, goalDone} — goalDone = goal kép
 * (phút nghe hôm nay ≥ daily_goal_minutes AND practicedToday ≥
 * daily_goal_words), VN-day. 2 query nhỏ thêm (daily_activity row hôm nay +
 * COUNT DISTINCT practiced §3.5 — mirror today-store). Guest → null (giữ
 * contract cũ — UserMenu chỉ đọc subset cũ vẫn OK).
 */
const dbState = vi.hoisted(() => ({ queue: [] as unknown[] }));

function chainOf(): unknown {
  const result = dbState.queue.shift();
  const p = Promise.resolve(result);
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
  },
}));

const authState = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

const { readMyStats } = await import("./my-stats");

beforeEach(() => {
  dbState.queue = [];
  authState.session = { user: { id: "u1" } };
});

afterEach(() => {
  authState.session = null;
});

describe("readMyStats — shape {xp, streak, goalDone}", () => {
  it("guest → null (không đổi contract cũ)", async () => {
    authState.session = null;
    await expect(readMyStats()).resolves.toBeNull();
  });

  it("profile mất → null", async () => {
    dbState.queue = [[]];
    await expect(readMyStats()).resolves.toBeNull();
  });

  it("mặc định (không activity, chưa practiced) → goalDone false", async () => {
    dbState.queue = [
      [{ xp: 100, streakCount: 2, dailyGoalMinutes: 10, dailyGoalWords: 5 }],
      [], // daily_activity hôm nay — không row
      [{ practiced: 0 }],
    ];
    await expect(readMyStats()).resolves.toEqual({
      xp: 100,
      streak: 2,
      goalDone: false,
    });
  });

  it("đạt cả 2 (phút 5/5 + practiced 5/5) → goalDone true", async () => {
    dbState.queue = [
      [{ xp: 200, streakCount: 3, dailyGoalMinutes: 5, dailyGoalWords: 5 }],
      [{ listenMs: 300_000 }],
      [{ practiced: 5 }],
    ];
    await expect(readMyStats()).resolves.toEqual({
      xp: 200,
      streak: 3,
      goalDone: true,
    });
  });

  it.each([
    [
      "chỉ phút đạt (5/5 phút, 2/5 từ)",
      { listenMs: 300_000 },
      { practiced: 2 },
      5,
      5,
    ],
    [
      "chỉ từ đạt (4/10 phút, 5/5 từ)",
      { listenMs: 240_000 },
      { practiced: 5 },
      10,
      5,
    ],
    [
      "vượt quota phút vẫn cần đủ từ (90s floor 1 < 5)",
      { listenMs: 90_000 },
      { practiced: 3 },
      5,
      5,
    ],
  ])(
    "%s → goalDone false",
    async (_name, activity, vocab, goalM, goalW) => {
      dbState.queue = [
        [
          {
            xp: 1,
            streakCount: 0,
            dailyGoalMinutes: goalM,
            dailyGoalWords: goalW,
          },
        ],
        [activity],
        [vocab],
      ];
      const s = await readMyStats();
      expect(s?.goalDone).toBe(false);
    },
  );

  it("listen_ms floor (89s → 0 phút) + vượt goal → true khi từ đủ", async () => {
    dbState.queue = [
      [{ xp: 1, streakCount: 0, dailyGoalMinutes: 1, dailyGoalWords: 2 }],
      [{ listenMs: 89_000 }], // floor 1 phút
      [{ practiced: 2 }],
    ];
    const s = await readMyStats();
    expect(s?.goalDone).toBe(true);
  });

  it("queue 3 chain theo thứ tự impl: profile → activity → practiced", async () => {
    dbState.queue = [
      [{ xp: 5, streakCount: 1, dailyGoalMinutes: 10, dailyGoalWords: 5 }],
      [{ listenMs: 600_000 }],
      [{ practiced: 5 }],
    ];
    const s = await readMyStats();
    expect(s?.goalDone).toBe(true);
    // queue rỗng — cả 3 chain đã tiêu (không query thừa)
    expect(dbState.queue).toHaveLength(0);
  });

  it("DB hỏng row profile (undefined) → throw — contract cũ, caller header .catch", async () => {
    dbState.queue = [undefined];
    await expect(readMyStats()).rejects.toThrow(TypeError);
  });
});

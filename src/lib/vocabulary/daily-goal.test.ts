import { describe, expect, it } from "vitest";

/**
 * Daily goal helper (vocab-memrise SF-1 t-7 — epic spec §2.3). PURE so sánh
 * plantedToday/goal — day boundary là việc CALLER (dùng vnToday/ILEC_TZ từ
 * src/lib/gamification/streak.ts, TÁI DÙNG không copy).
 */
import { goalStatus } from "./daily-goal";

describe("goalStatus — goal ring planted/goal", () => {
  it("dưới goal: remaining = goal − planted, pct nguyên", () => {
    expect(goalStatus({ plantedToday: 3, goal: 5 })).toEqual({
      done: false,
      remaining: 2,
      pct: 60,
    });
  });

  it("đủ goal: done, remaining 0, pct 100", () => {
    expect(goalStatus({ plantedToday: 5, goal: 5 })).toEqual({
      done: true,
      remaining: 0,
      pct: 100,
    });
  });

  it("vượt goal: pct kẹp 100 (không tròn vòng)", () => {
    expect(goalStatus({ plantedToday: 7, goal: 5 })).toEqual({
      done: true,
      remaining: 0,
      pct: 100,
    });
  });

  it("planted 0: pct 0", () => {
    expect(goalStatus({ plantedToday: 0, goal: 10 })).toEqual({
      done: false,
      remaining: 10,
      pct: 0,
    });
  });

  it("goal 0 (chưa cấu hình): coi như xong, không chia 0", () => {
    expect(goalStatus({ plantedToday: 0, goal: 0 })).toEqual({
      done: true,
      remaining: 0,
      pct: 100,
    });
  });

  it("pct làm tròn xuống (2/3 = 66)", () => {
    expect(goalStatus({ plantedToday: 2, goal: 3 }).pct).toBe(66);
  });
});

import { describe, expect, it } from "vitest";
import { dualGoalStatus } from "./today-engine";

/**
 * Dual-goal status thuần — daily-journey SF-1 (VU-49, epic spec §2.2): bọc
 * goalStatus vocab (param name `plantedToday` giữ nguyên — chỉ đổi NGHĨA
 * đầu vào thành practicedToday). GoalDone kép = minutes-done AND words-done.
 */
describe("dualGoalStatus — goal kép phút nghe + từ ôn/luyện", () => {
  it("cả hai done → both true, pct kẹp 100, remaining 0", () => {
    const status = dualGoalStatus({
      minutesToday: 15,
      goalMinutes: 10,
      practicedToday: 6,
      goalWords: 5,
    });
    expect(status.minutes).toEqual({ done: true, remaining: 0, pct: 100 });
    expect(status.words).toEqual({ done: true, remaining: 0, pct: 100 });
    expect(status.both).toBe(true);
  });

  it("một done (đủ phút, thiếu từ) → both false", () => {
    const status = dualGoalStatus({
      minutesToday: 12,
      goalMinutes: 10,
      practicedToday: 2,
      goalWords: 5,
    });
    expect(status.minutes.done).toBe(true);
    expect(status.words.done).toBe(false);
    expect(status.words.remaining).toBe(3);
    expect(status.both).toBe(false);
  });

  it("một done (đủ từ, thiếu phút) → both false", () => {
    const status = dualGoalStatus({
      minutesToday: 4,
      goalMinutes: 10,
      practicedToday: 5,
      goalWords: 5,
    });
    expect(status.minutes.done).toBe(false);
    expect(status.words.done).toBe(true);
    expect(status.both).toBe(false);
  });

  it("0-goal: goal 0 coi như xong (goalStatus contract) — cả hai goal 0 → both true", () => {
    const status = dualGoalStatus({
      minutesToday: 0,
      goalMinutes: 0,
      practicedToday: 0,
      goalWords: 0,
    });
    expect(status.minutes.done).toBe(true);
    expect(status.minutes.pct).toBe(100);
    expect(status.words.done).toBe(true);
    expect(status.both).toBe(true);
  });

  it("chỉ goal phút = 0 → nhánh phút xong, nhánh từ vẫn chờ", () => {
    const status = dualGoalStatus({
      minutesToday: 0,
      goalMinutes: 0,
      practicedToday: 1,
      goalWords: 5,
    });
    expect(status.minutes.done).toBe(true);
    expect(status.words.done).toBe(false);
    expect(status.both).toBe(false);
  });

  it("pct floor nguyên: 1/3 phút → 33 (không làm tròn lên)", () => {
    const status = dualGoalStatus({
      minutesToday: 1,
      goalMinutes: 3,
      practicedToday: 0,
      goalWords: 5,
    });
    expect(status.minutes.pct).toBe(33);
  });

  it("vượt goal không âm remaining / không vượt 100 pct", () => {
    const status = dualGoalStatus({
      minutesToday: 60,
      goalMinutes: 10,
      practicedToday: 20,
      goalWords: 5,
    });
    expect(status.minutes.pct).toBe(100);
    expect(status.words.remaining).toBe(0);
  });

  it("đầu vào âm (dữ liệu lệch) được kẹp 0 — không âm pct/remaining", () => {
    const status = dualGoalStatus({
      minutesToday: -5,
      goalMinutes: 10,
      practicedToday: -1,
      goalWords: 5,
    });
    expect(status.minutes.done).toBe(false);
    expect(status.minutes.remaining).toBe(10);
    expect(status.words.remaining).toBe(5);
    expect(status.both).toBe(false);
  });
});

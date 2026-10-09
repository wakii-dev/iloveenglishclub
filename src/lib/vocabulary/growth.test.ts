import { describe, expect, it } from "vitest";

/**
 * Growth stage 8 mức (vocab-memrise SF-1 t-5, epic spec §2.4 — garden
 * metaphor). Bảng boundary CỨNG: đo theo intervalDays sau grade; reps=0
 * (chưa planted — gồm mọi từ seed) luôn stage 0 bất kể interval.
 */
import { GROWTH_STAGES, growthStage } from "./growth";

describe("growthStage — bảng boundary spec §2.4", () => {
  it("reps = 0 → stage 0 (chưa planted) — kể cả interval lớn (row seed)", () => {
    expect(growthStage({ reps: 0, intervalDays: 0 })).toBe(0);
    expect(growthStage({ reps: 0, intervalDays: 300 })).toBe(0);
  });

  it("planted intervalDays < 2 → stage 1 (Nảy mầm)", () => {
    expect(growthStage({ reps: 1, intervalDays: 0 })).toBe(1);
    expect(growthStage({ reps: 1, intervalDays: 1 })).toBe(1);
  });

  it("biên 2 → stage 2 (Cây con), 6 vẫn 2", () => {
    expect(growthStage({ reps: 1, intervalDays: 2 })).toBe(2);
    expect(growthStage({ reps: 2, intervalDays: 6 })).toBe(2);
  });

  it("biên 7 → stage 3 (Nụ), 13 vẫn 3", () => {
    expect(growthStage({ reps: 2, intervalDays: 7 })).toBe(3);
    expect(growthStage({ reps: 3, intervalDays: 13 })).toBe(3);
  });

  it("biên 14 → stage 4 (Cây non), 44 vẫn 4", () => {
    expect(growthStage({ reps: 3, intervalDays: 14 })).toBe(4);
    expect(growthStage({ reps: 4, intervalDays: 44 })).toBe(4);
  });

  it("biên 45 → stage 5 (Cây xanh), 99 vẫn 5", () => {
    expect(growthStage({ reps: 4, intervalDays: 45 })).toBe(5);
    expect(growthStage({ reps: 5, intervalDays: 99 })).toBe(5);
  });

  it("biên 100 → stage 6 (Trỗi dậy), 199 vẫn 6", () => {
    expect(growthStage({ reps: 5, intervalDays: 100 })).toBe(6);
    expect(growthStage({ reps: 6, intervalDays: 199 })).toBe(6);
  });

  it("biên 200 → stage 7 (Nở hoa), lớn hơn vẫn 7", () => {
    expect(growthStage({ reps: 7, intervalDays: 200 })).toBe(7);
    expect(growthStage({ reps: 10, intervalDays: 232 })).toBe(7);
  });

  it("input lỗi âm → kẹp về 0 an toàn (DB có thể bị sửa tay)", () => {
    expect(growthStage({ reps: -1, intervalDays: -5 })).toBe(0);
  });
});

describe("GROWTH_STAGES — metadata i18n", () => {
  it("đúng 8 stage, key learn.stage.0..7, nameKey khớp vị trí", () => {
    expect(GROWTH_STAGES).toHaveLength(8);
    GROWTH_STAGES.forEach((s, i) => {
      expect(s.stage).toBe(i);
      expect(s.nameKey).toBe(`learn.stage.${i}`);
    });
  });
});

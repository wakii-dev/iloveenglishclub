import { describe, expect, it } from "vitest";
import {
  accuracyRingDash,
  clampSeek,
  formatTime,
  lessonFacts,
  waveformFillCount,
} from "./format";

describe("formatTime", () => {
  it("định dạng m:ss — 0s → 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });
  it("dưới 10 giây pad 0 — 7s → 0:07", () => {
    expect(formatTime(7)).toBe("0:07");
  });
  it("trên một phút — 75s → 1:15", () => {
    expect(formatTime(75)).toBe("1:15");
  });
  it("làm tròn xuống — 3.9s → 0:03", () => {
    expect(formatTime(3.9)).toBe("0:03");
  });
  it("âm/nNaN → 0:00 (guard)", () => {
    expect(formatTime(-2)).toBe("0:00");
    expect(formatTime(Number.NaN)).toBe("0:00");
  });
});

describe("clampSeek", () => {
  it("giữ trong [0, duration]", () => {
    expect(clampSeek(1500, 3500)).toBe(1500);
    expect(clampSeek(-500, 3500)).toBe(0);
    expect(clampSeek(9999, 3500)).toBe(3500);
  });
  it("duration ≤ 0 → 0 (guard chia)", () => {
    expect(clampSeek(1500, 0)).toBe(0);
    expect(clampSeek(1500, -1)).toBe(0);
  });
});

describe("waveformFillCount", () => {
  it("round(elapsed/duration × 28)", () => {
    expect(waveformFillCount(0, 3500)).toBe(0);
    expect(waveformFillCount(3500, 3500)).toBe(28);
    expect(waveformFillCount(1750, 3500)).toBe(14);
  });
  it("elapsed 0 nhưng durationMs null → dùng fallback qua caller — helper nhận duration ≤ 0 → 0", () => {
    expect(waveformFillCount(1000, 0)).toBe(0);
  });
  it("clamp [0, 28] khi lệch tỉ lệ", () => {
    expect(waveformFillCount(4000, 3500)).toBe(28);
    expect(waveformFillCount(-100, 3500)).toBe(0);
  });
});

describe("lessonFacts", () => {
  it("4 part 3500ms → 4 câu · 14s audio · ~2 phút · +40 XP max", () => {
    const parts = Array.from({ length: 4 }, () => ({ durationMs: 3500 }));
    expect(lessonFacts(parts)).toEqual({
      sentences: 4,
      totalAudioMs: 14000,
      minutesEstimate: 2,
      xpMax: 40,
    });
  });
  it("durationMs null được bỏ qua trong tổng audio", () => {
    expect(lessonFacts([{ durationMs: null }, { durationMs: 2000 }])).toEqual({
      sentences: 2,
      totalAudioMs: 2000,
      minutesEstimate: 1,
      xpMax: 20,
    });
  });
  it("lesson rỗng → 0 câu · 0 phút (không âm)", () => {
    expect(lessonFacts([])).toEqual({
      sentences: 0,
      totalAudioMs: 0,
      minutesEstimate: 0,
      xpMax: 0,
    });
  });
});

describe("accuracyRingDash", () => {
  it("pct → dasharray theo chu vi 326.7", () => {
    expect(accuracyRingDash(1)).toBe("326.7 327");
    expect(accuracyRingDash(0)).toBe("0 327");
  });
  it("86% → 281 (prototype)", () => {
    expect(accuracyRingDash(0.86)).toBe("281 327");
  });
  it("clamp [0,1]", () => {
    expect(accuracyRingDash(1.5)).toBe("326.7 327");
    expect(accuracyRingDash(-0.2)).toBe("0 327");
  });
});

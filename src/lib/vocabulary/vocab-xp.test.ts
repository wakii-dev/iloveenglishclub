import { describe, expect, it } from "vitest";

/**
 * XP rules vocab (vocab-memrise SF-1 t-3, epic spec §4) — PURE, số 4/1/60
 * PIN trong tests (khung cứng — đổi số mà không sửa test = violation).
 * Anti-farm 3 lớp quyết ở computeXpAward: idempotency (lớp store),
 * lần-đầu-trong-ngày + learn-complete-lần-đầu (flag đầu vào), cap 60/ngày.
 */
import {
  DAILY_XP_CAP,
  LEARN_COMPLETE_XP,
  STEP_XP,
  computeXpAward,
  idempotencyKey,
  isVocabActivityKind,
} from "./vocab-xp";

describe("hằng số XP — pin spec §4", () => {
  it("learn-complete = 4, session-step = 1, cap = 60", () => {
    expect(LEARN_COMPLETE_XP).toBe(4);
    expect(STEP_XP).toBe(1);
    expect(DAILY_XP_CAP).toBe(60);
  });
});

describe("idempotencyKey — server derive (spec §4)", () => {
  it("đúng format `${userId}:${sessionKey}:${wordId}:${stepIndex}:${attemptNo}`", () => {
    expect(idempotencyKey("u1", "s-ab", 7, 3, 2)).toBe("u1:s-ab:7:3:2");
  });

  it("khác attemptNo → key khác (retry sau sai là instance mới)", () => {
    expect(idempotencyKey("u1", "s", 7, 3, 1)).not.toBe(
      idempotencyKey("u1", "s", 7, 3, 2),
    );
  });
});

describe("isVocabActivityKind — guard cho route validate (SF-2 dùng)", () => {
  it("chỉ nhận 2 kind schema CHECK", () => {
    expect(isVocabActivityKind("learn-complete")).toBe(true);
    expect(isVocabActivityKind("session-step")).toBe(true);
    expect(isVocabActivityKind("quiz")).toBe(false);
    expect(isVocabActivityKind("")).toBe(false);
  });
});

describe("computeXpAward — quyết XP từ flag đầu vào", () => {
  const step = {
    kind: "session-step" as const,
    correct: true,
    correctTodayExists: false,
    learnCompleteExists: false,
    vocabXpToday: 0,
  };

  it("sai → 0 XP, không coi là capped (bất kể flag khác)", () => {
    expect(
      computeXpAward({ ...step, correct: false, vocabXpToday: 60 }),
    ).toEqual({ xpAwarded: 0, xpCapped: false });
  });

  it("bước đúng lần-đầu-trong-ngày → +1, không capped", () => {
    expect(computeXpAward(step)).toEqual({ xpAwarded: 1, xpCapped: false });
  });

  it("bước đúng nhưng (user, word) đã có correct=true hôm nay → 0 (anti-farm regrade/attemptNo mới/prefill)", () => {
    expect(
      computeXpAward({ ...step, correctTodayExists: true }),
    ).toEqual({ xpAwarded: 0, xpCapped: false });
  });

  it("learn-complete lần đầu (reps đầu vượt 0) → +4", () => {
    expect(
      computeXpAward({ ...step, kind: "learn-complete" }),
    ).toEqual({ xpAwarded: 4, xpCapped: false });
  });

  it("learn-complete đã tồn tại kind cho (user, word) → 0 (chỉ lần đầu)", () => {
    expect(
      computeXpAward({
        ...step,
        kind: "learn-complete",
        learnCompleteExists: true,
      }),
    ).toEqual({ xpAwarded: 0, xpCapped: false });
  });

  it("đã đạt cap 60 → đúng vẫn 0 + xpCapped=true", () => {
    expect(computeXpAward({ ...step, vocabXpToday: 60 })).toEqual({
      xpAwarded: 0,
      xpCapped: true,
    });
  });

  it("gần cap → phần dư; đệm đúng cap (59+1=60) không cắt → capped=false, thiếu dư mới capped=true", () => {
    expect(computeXpAward({ ...step, vocabXpToday: 59 })).toEqual({
      xpAwarded: 1,
      xpCapped: false,
    });
    expect(
      computeXpAward({ ...step, kind: "learn-complete", vocabXpToday: 59 }),
    ).toEqual({ xpAwarded: 1, xpCapped: true });
    expect(
      computeXpAward({ ...step, kind: "learn-complete", vocabXpToday: 58 }),
    ).toEqual({ xpAwarded: 2, xpCapped: true });
  });

  it("trên 60 (đề phòng) vẫn kẹp 0", () => {
    expect(computeXpAward({ ...step, vocabXpToday: 61 })).toEqual({
      xpAwarded: 0,
      xpCapped: true,
    });
  });

  it("anti-farm thắng cap: lặp từ đã-correct-hôm-nay lúc đã chạm cap → 0, xpCapped=false (0 vì lặp, không phải vì cap)", () => {
    expect(
      computeXpAward({
        ...step,
        correctTodayExists: true,
        vocabXpToday: 60,
      }),
    ).toEqual({ xpAwarded: 0, xpCapped: false });
  });

  it("learn-complete cũng chịu cap (58 hôm nay → 2 dư)", () => {
    expect(
      computeXpAward({ ...step, kind: "learn-complete", vocabXpToday: 58 }),
    ).toEqual({ xpAwarded: 2, xpCapped: true });
  });
});

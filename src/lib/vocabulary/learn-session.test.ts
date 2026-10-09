import { describe, expect, it } from "vitest";

/**
 * Session engine thuần (SF-2, VU-39) — contract pin theo context pack #1-5 +
 * epic §2.1/§2.2: payload không đáp án, chuỗi per từ, degenerate pool,
 * interleave server-owned, typo tolerance, grade map MỘT grade/từ/lượt.
 */
import {
  isSessionKind,
  isStepKind,
  LEARN_SESSION_WORDS,
  SESSION_KINDS,
  STEP_KINDS,
} from "./learn-session";

describe("guards — taxonomy đầu vào route", () => {
  it("isSessionKind nhận đúng 2 kind, chặn lạ", () => {
    expect(SESSION_KINDS).toEqual(["learn", "review"]);
    expect(isSessionKind("learn")).toBe(true);
    expect(isSessionKind("review")).toBe(true);
    expect(isSessionKind("quiz")).toBe(false);
    expect(isSessionKind("")).toBe(false);
    expect(isSessionKind(1)).toBe(false);
    expect(isSessionKind(null)).toBe(false);
  });

  it("isStepKind nhận đúng 4 kind, chặn lạ", () => {
    expect(STEP_KINDS).toEqual(["introduce", "mc", "listen", "type"]);
    expect(isStepKind("introduce")).toBe(true);
    expect(isStepKind("mc")).toBe(true);
    expect(isStepKind("listen")).toBe(true);
    expect(isStepKind("type")).toBe(true);
    expect(isStepKind("matching")).toBe(false);
    expect(isStepKind("introduce ")).toBe(false);
  });

  it("LEARN_SESSION_WORDS = 5 — phiên learn 5 từ (pin acceptance)", () => {
    expect(LEARN_SESSION_WORDS).toBe(5);
  });
});

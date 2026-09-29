import { describe, expect, it } from "vitest";
import { attemptIdFor } from "./attempt-key";

/**
 * Client stable attempt-id (SF-6): UUID ổn định theo
 * (partId, typedText, relaxed, usedHint) — nhấn Enter đôi nhanh (cùng text,
 * cùng flags) → CÙNG client_attempt_id → unique constraint DB chặn còn đúng
 * 1 attempt (ACCEPTANCE). Sửa text/check lại → id mới → attempt mới (log đủ).
 */
describe("attemptIdFor", () => {
  it("cùng (part, text, flags) → cùng id (idempotent submit)", () => {
    const a = attemptIdFor(7, "I play football", false, false);
    const b = attemptIdFor(7, "I play football", false, false);
    expect(a).toBe(b);
  });

  it("text khác → id khác (attempt mới)", () => {
    const a = attemptIdFor(7, "I play football", false, false);
    const b = attemptIdFor(7, "I play friendball", false, false);
    expect(a).not.toBe(b);
  });

  it("part khác → id khác", () => {
    expect(attemptIdFor(7, "same", false, false)).not.toBe(
      attemptIdFor(8, "same", false, false),
    );
  });

  it("relaxed/hint khác → id khác (mỗi biến thể 1 attempt)", () => {
    const base = attemptIdFor(7, "same", false, false);
    expect(attemptIdFor(7, "same", true, false)).not.toBe(base);
    expect(attemptIdFor(7, "same", false, true)).not.toBe(base);
  });

  it("id là UUID hợp lệ", () => {
    expect(attemptIdFor(1, "x", false, false)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

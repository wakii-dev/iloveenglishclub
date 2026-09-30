import { describe, expect, it } from "vitest";
import {
  MAX_SENTENCES_PER_BATCH,
  sanitizeSentences,
} from "./parts-logic";

/**
 * Contract SAU fix QA-303 (RED→GREEN 2026-09-30): sanitizeSentences KHÔNG còn
 * truncate ngầm — trả TOÀN BỘ câu đã clean. Guard `tooManySentences` của
 * addPartsFromScriptAction là nơi chặn >200 (toast lỗi rõ cho admin), thay vì
 * chèn 200 câu im lặng + toast đếm sai. `dropped` bỏ khỏi return (caller duy
 * nhất parts.ts chỉ destructure `sentences`).
 */
describe("sanitizeSentences", () => {
  it("trim từng câu + bỏ câu rỗng/trắng", () => {
    expect(sanitizeSentences(["  Hi. ", "", "   ", "Bye."])).toEqual({
      sentences: ["Hi.", "Bye."],
    });
  });

  it("mảng rỗng hoặc toàn trắng → sentences rỗng", () => {
    expect(sanitizeSentences([])).toEqual({ sentences: [] });
    expect(sanitizeSentences(["", " "])).toEqual({ sentences: [] });
  });

  it("KHÔNG truncate: 207 câu → trả đủ 207 (guard >200 nằm ở action, QA-303)", () => {
    const many = Array.from(
      { length: MAX_SENTENCES_PER_BATCH + 7 },
      (_, i) => `S${i}.`,
    );
    expect(sanitizeSentences(many).sentences).toHaveLength(
      MAX_SENTENCES_PER_BATCH + 7,
    );
  });

  it("đúng 200 câu → nguyên vẹn", () => {
    const exactly = Array.from(
      { length: MAX_SENTENCES_PER_BATCH },
      (_, i) => `S${i}.`,
    );
    expect(sanitizeSentences(exactly).sentences).toHaveLength(
      MAX_SENTENCES_PER_BATCH,
    );
  });
});

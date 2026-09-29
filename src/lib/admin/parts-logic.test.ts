import { describe, expect, it } from "vitest";
import {
  MAX_SENTENCES_PER_BATCH,
  sanitizeSentences,
} from "./parts-logic";

describe("sanitizeSentences", () => {
  it("trim từng câu + bỏ câu rỗng/trắng", () => {
    expect(sanitizeSentences(["  Hi. ", "", "   ", "Bye."])).toEqual({
      sentences: ["Hi.", "Bye."],
      dropped: 0,
    });
  });

  it("mảng rỗng hoặc toàn trắng → sentences rỗng", () => {
    expect(sanitizeSentences([])).toEqual({ sentences: [], dropped: 0 });
    expect(sanitizeSentences(["", " "])).toEqual({ sentences: [], dropped: 0 });
  });

  it("cap 200 câu/batch — dôi ra bị drop và báo số dropped", () => {
    const many = Array.from({ length: MAX_SENTENCES_PER_BATCH + 7 }, (_, i) => `S${i}.`);
    const result = sanitizeSentences(many);
    expect(result.sentences).toHaveLength(MAX_SENTENCES_PER_BATCH);
    expect(result.dropped).toBe(7);
  });

  it("đúng 200 câu → không drop", () => {
    const exactly = Array.from({ length: MAX_SENTENCES_PER_BATCH }, (_, i) => `S${i}.`);
    const result = sanitizeSentences(exactly);
    expect(result.sentences).toHaveLength(MAX_SENTENCES_PER_BATCH);
    expect(result.dropped).toBe(0);
  });
});

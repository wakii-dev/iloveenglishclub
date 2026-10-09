import { describe, expect, it } from "vitest";

/**
 * Level chunk sách (vocab-memrise SF-1 t-6, epic spec §2.5 — định nghĩa
 * CỨNG): Level = chunk WORDS_PER_LEVEL = 10 từ theo book_words.order tăng
 * dần; level kế tiếp = chunk ĐẦU TIÊN (theo order) còn ≥1 từ reps = 0
 * (không skip); hết chunk planted → null (sách hoàn thành).
 */
import {
  WORDS_PER_LEVEL,
  chunkLevels,
  levelProgress,
  nextLevel,
  type WordLevelRow,
} from "./levels";

// word n: order = n, reps theo tham số
const w = (order: number, reps = 0): WordLevelRow => ({
  wordId: order,
  order,
  reps,
});

describe("WORDS_PER_LEVEL", () => {
  it("pin 10 (spec §2.5)", () => {
    expect(WORDS_PER_LEVEL).toBe(10);
  });
});

describe("chunkLevels — chunk theo order tăng dần", () => {
  it("23 từ → chunks 10/10/3 (chunk cuối lẻ)", () => {
    const rows = Array.from({ length: 23 }, (_, i) => w(i + 1, 1));
    const chunks = chunkLevels(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].words).toHaveLength(10);
    expect(chunks[1].words).toHaveLength(10);
    expect(chunks[2].words).toHaveLength(3);
    expect(chunks[2].words[2].order).toBe(23);
  });

  it("input lộn xộn order → sort lại trước khi chunk (đã JOIN sẵn, thứ tự không bảo đảm)", () => {
    // 4 từ < 10 → 1 chunk duy nhất, order 13 vẫn slot thứ 4 (chunk theo VỊ TRÍ, không theo giá trị order)
    const chunks = chunkLevels([w(3, 1), w(1), w(2, 1), w(13)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].words.map((r) => r.order)).toEqual([1, 2, 3, 13]);
  });

  it("book 0 từ → mảng rỗng", () => {
    expect(chunkLevels([])).toEqual([]);
  });
});

describe("nextLevel — chunk ĐẦU TIÊN còn ≥1 từ reps = 0 (không skip)", () => {
  it("level 1 planted hết, level 2 còn reps=0 → trả level 2 (index 1)", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => w(i + 1, 1)), // level 1 planted
      w(11, 0), // level 2: 1 từ chưa planted
      w(12, 1),
    ];
    const next = nextLevel(rows);
    expect(next).not.toBeNull();
    expect(next?.levelIndex).toBe(1);
    expect(next?.words.map((r) => r.order)).toEqual([11, 12]);
  });

  it("chunk giữa lẫn reps=0 → chunk đó là next (không nhảy cóc sang sau)", () => {
    const rows = [
      w(1, 1),
      w(2, 1),
      w(3, 0), // level 1 còn 1 từ chưa planted → chính nó là next
      w(11, 0),
    ];
    expect(nextLevel(rows)?.levelIndex).toBe(0);
  });

  it("mọi chunk planted hết → null (sách hoàn thành, GET steps rỗng)", () => {
    const rows = Array.from({ length: 12 }, (_, i) => w(i + 1, 1));
    expect(nextLevel(rows)).toBeNull();
  });

  it("book 0 từ → null", () => {
    expect(nextLevel([])).toBeNull();
  });
});

describe("levelProgress — planted/tổng per level + per book", () => {
  it("15 từ (10+5), planted 12 → level 0: 10/10, level 1: 2/5, book 12/15", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => w(i + 1, 1)),
      w(11, 1),
      w(12, 1),
      w(13, 0),
      w(14, 0),
      w(15, 0),
    ];
    const progress = levelProgress(rows);
    expect(progress.levels).toEqual([
      { levelIndex: 0, planted: 10, total: 10 },
      { levelIndex: 1, planted: 2, total: 5 },
    ]);
    expect(progress.planted).toBe(12);
    expect(progress.total).toBe(15);
  });

  it("book 0 từ → totals 0, levels rỗng (không chia 0)", () => {
    expect(levelProgress([])).toEqual({ levels: [], planted: 0, total: 0 });
  });
});

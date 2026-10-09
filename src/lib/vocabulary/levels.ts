/**
 * Level chunk sách (vocab-memrise SF-1, VU-38 — epic spec §2.5). PURE, không
 * db/next — input là rows ĐÃ JOIN sẵn `[{wordId, order, reps}]` (store SQL-side
 * chọn sách + join user_word_progress, lib không truy vấn).
 *
 * Định nghĩa CỨNG (pin levels.test.ts):
 * - Level = chunk WORDS_PER_LEVEL = 10 từ theo book_words.order TĂNG DẦN
 * - Level kế tiếp của (user, book) = chunk ĐẦU TIÊN (theo order) còn chứa
 *   ≥1 từ reps = 0 — continue = chunk đó, KHÔNG skip
 * - Mọi chunk planted hết → null (sách hoàn thành — GET steps rỗng, continue
 *   card "hoàn thành")
 * Chú ý: seed learn-flow tạo row progress với reps = 0 (seed ≠ planted) —
 * những từ đó VẪN thuộc learn queue.
 */

export const WORDS_PER_LEVEL = 10;

/** 1 từ của sách kèm trạng thái SRS của user (đã JOIN sẵn ở store). */
export type WordLevelRow = {
  wordId: number;
  /** book_words.order — thứ tự học trong sách. */
  order: number;
  /** user_word_progress.reps — 0 = chưa planted. */
  reps: number;
};

export type LevelChunk = {
  /** 0-based — UI hiển thị +1. */
  levelIndex: number;
  words: WordLevelRow[];
};

export type LevelProgress = {
  /** planted/tổng từng level theo order — mảng rỗng khi sách 0 từ. */
  levels: { levelIndex: number; planted: number; total: number }[];
  planted: number;
  total: number;
};

/** Chia sách thành các level chunk 10 từ theo order tăng dần. */
export function chunkLevels(rows: readonly WordLevelRow[]): LevelChunk[] {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const chunks: LevelChunk[] = [];
  for (let i = 0; i < sorted.length; i += WORDS_PER_LEVEL) {
    chunks.push({
      levelIndex: chunks.length,
      words: sorted.slice(i, i + WORDS_PER_LEVEL),
    });
  }
  return chunks;
}

/**
 * Chunk ĐẦU TIÊN (theo order) còn ≥1 từ reps = 0 — null khi sách hoàn thành
 * (hoặc sách 0 từ).
 */
export function nextLevel(
  rows: readonly WordLevelRow[],
): LevelChunk | null {
  return (
    chunkLevels(rows).find((chunk) =>
      chunk.words.some((word) => word.reps === 0),
    ) ?? null
  );
}

/** Progress per level + per book (planted = reps ≥ 1). */
export function levelProgress(rows: readonly WordLevelRow[]): LevelProgress {
  const chunks = chunkLevels(rows);
  const levels = chunks.map((chunk) => ({
    levelIndex: chunk.levelIndex,
    planted: chunk.words.filter((word) => word.reps > 0).length,
    total: chunk.words.length,
  }));
  return {
    levels,
    planted: levels.reduce((sum, l) => sum + l.planted, 0),
    total: levels.reduce((sum, l) => sum + l.total, 0),
  };
}

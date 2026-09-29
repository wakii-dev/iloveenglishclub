/**
 * Parts pure logic (SF-5) — tách khỏi server actions để unit test 100% nhánh.
 * Cap 200 câu/batch: chống paste file khổng lồ (đủ dùng — 1 bài dictation
 * vài chục câu); cũng giữ lesson < 1000 parts để shift bump-offset +1000
 * trong actions/parts.ts luôn an toàn (comment ở đó).
 */
export const MAX_SENTENCES_PER_BATCH = 200;

export function sanitizeSentences(raw: string[]): {
  sentences: string[];
  dropped: number;
} {
  const cleaned = raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return {
    sentences: cleaned.slice(0, MAX_SENTENCES_PER_BATCH),
    dropped: cleaned.length - Math.min(cleaned.length, MAX_SENTENCES_PER_BATCH),
  };
}

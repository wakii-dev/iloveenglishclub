/**
 * Match rule words ↔ crawl_entries (VU-32 SF-2) — PURE. Contract spec §[match]
 * (SF-3 phụ thuộc hành vi): normalizeMatch(x) = trim + lowercase + strip
 * `_\d+$` + '-'→space + collapse whitespace. Đối sánh words.word (qua
 * normalizeMatch) với CẢ HAI crawl_entries.word (headword trim+lowercase,
 * KHÔNG strip) và crawl_entries.slug (qua normalizeMatch).
 *
 * Winner deterministic: headword exact > slug match; nhiều entry khớp
 * (homograph bank_1/bank_2) → cefr non-null trước, rồi id nhỏ nhất.
 * Fill từ ĐÚNG 1 entry thắng.
 */

export type MatchCandidate = {
  id: number;
  slug: string;
  /** Headword từ parse — null khi pending (chưa fetch). */
  word: string | null;
  cefr: string | null;
};

/** Chuẩn hoá phía words.word + crawl_entries.slug (strip _N + đổi dash). */
export function normalizeMatch(x: string): string {
  return x
    .trim()
    .toLowerCase()
    .replace(/_\d+$/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chuẩn hoá phía crawl_entries.word — trim + lowercase, KHÔNG strip/đổi. */
export function normalizeHeadword(x: string): string {
  return x.trim().toLowerCase();
}

/**
 * Chọn entry thắng cho 1 word trong danh sách candidate (đã fetch theo batch
 * query — superset). null khi không candidate nào khớp.
 */
export function matchWord(rawWord: string, candidates: MatchCandidate[]): MatchCandidate | null {
  const norm = normalizeMatch(rawWord);
  if (!norm) return null;

  const byHeadword = candidates.filter(
    (c) => c.word !== null && normalizeHeadword(c.word) === norm,
  );
  const pool = byHeadword.length > 0
    ? byHeadword
    : candidates.filter((c) => normalizeMatch(c.slug) === norm);
  if (pool.length === 0) return null;

  // cefr non-null trước, rồi id nhỏ nhất — deterministic
  return pool.reduce((best, c) => {
    if ((best.cefr === null) !== (c.cefr === null)) return c.cefr !== null ? c : best;
    return c.id < best.id ? c : best;
  });
}

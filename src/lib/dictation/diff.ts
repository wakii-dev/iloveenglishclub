/**
 * Dictation diff + scoring — pure module (epic spec §5, CHỐT CỨNG).
 * Client (SF-4 preview) và server (SF-6 recompute) DÙNG CHUNG module này —
 * KHÔNG I/O, KHÔNG DOM, KHÔNG audio; deterministic tuyệt đối.
 */

export type CompareMode = "strict" | "relaxed";

/**
 * Tokenize theo khoảng trắng (spec §5.5): chuẩn hóa apostrophe cong `’` → `'`
 * trên toàn text TRƯỚC khi tách → contraction ("don't") luôn là 1 token.
 * Text rỗng/chỉ whitespace → [].
 */
export function tokenize(text: string): string[] {
  return text
    .replace(/’/g, "'")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Regex strip dấu câu/symbol CHỈ ở biên token (spec §1.2). Dựng từ string:
 *  target ES2017 + TS5.5 regex-checker chặn literal `\p{}` (ES2018). */
const EDGE_PUNCT_RE = new RegExp("^[\\p{P}\\p{S}]+|[\\p{P}\\p{S}]+$", "gu");

/**
 * Chuẩn hóa token theo mode: strict giữ nguyên (hoa/thường + dấu câu đính
 * token tính khác — "cat." ≠ "cat"); relaxed lowercase + strip dấu câu biên
 * (dấu câu GIỮA token giữ nguyên: "don't", "3.5"). Token toàn dấu câu → "".
 */
export function normalizeToken(token: string, mode: CompareMode): string {
  if (mode === "strict") return token;
  return token.toLowerCase().replace(EDGE_PUNCT_RE, "");
}

export type WordStatus = "matched" | "wrong" | "missing" | "extra";

export interface DiffWord {
  /** Index token transcript; -1 với token extra (vượt độ dài transcript). */
  transcriptIndex: number;
  transcriptToken: string | null;
  typedToken: string | null;
  status: WordStatus;
}

export interface DiffResult {
  words: DiffWord[];
  matchedCount: number;
  wrongCount: number;
  missingCount: number;
  extraCount: number;
  transcriptWordCount: number;
  /** Index transcript đầu tiên chưa đúng (wrong|missing); null nếu khớp hết. */
  firstIncorrectIndex: number | null;
  /** Mọi từ transcript matched VÀ không có token extra. */
  allCorrect: boolean;
}

/**
 * Word-diff POSITIONAL (spec §1.2 — diễn giải đã chốt, REQUIREMENT-GAP epic):
 * so transcript[i] với typed[i] theo thứ tự. Token transcript dư (hết typed)
 * → missing; token typed dư → extra (transcriptIndex -1, không vào mẫu số).
 */
export function diffWords(
  transcript: string,
  typed: string,
  mode: CompareMode,
): DiffResult {
  const t = tokenize(transcript);
  const inp = tokenize(typed);
  const words: DiffWord[] = [];
  let matchedCount = 0;
  let wrongCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  let firstIncorrectIndex: number | null = null;
  const n = Math.min(t.length, inp.length);

  for (let i = 0; i < n; i++) {
    if (normalizeToken(t[i]!, mode) === normalizeToken(inp[i]!, mode)) {
      matchedCount++;
      words.push({
        transcriptIndex: i,
        transcriptToken: t[i]!,
        typedToken: inp[i]!,
        status: "matched",
      });
    } else {
      wrongCount++;
      if (firstIncorrectIndex === null) firstIncorrectIndex = i;
      words.push({
        transcriptIndex: i,
        transcriptToken: t[i]!,
        typedToken: inp[i]!,
        status: "wrong",
      });
    }
  }
  for (let i = n; i < t.length; i++) {
    missingCount++;
    if (firstIncorrectIndex === null) firstIncorrectIndex = i;
    words.push({
      transcriptIndex: i,
      transcriptToken: t[i]!,
      typedToken: null,
      status: "missing",
    });
  }
  for (let i = n; i < inp.length; i++) {
    extraCount++;
    words.push({
      transcriptIndex: -1,
      transcriptToken: null,
      typedToken: inp[i]!,
      status: "extra",
    });
  }

  return {
    words,
    matchedCount,
    wrongCount,
    missingCount,
    extraCount,
    transcriptWordCount: t.length,
    firstIncorrectIndex,
    // Đúng hết = mọi từ transcript matched VÀ không gõ thừa (anti-gaming).
    allCorrect: matchedCount === t.length && extraCount === 0,
  };
}

/**
 * accuracy = matched / transcriptWordCount (spec §5.5 — mẫu số là TRANSCRIPT,
 * gõ thừa không tăng điểm). Transcript 0 từ → 0 (guard chia 0).
 */
export function computeAccuracy(diff: DiffResult): number {
  if (diff.transcriptWordCount === 0) return 0;
  return diff.matchedCount / diff.transcriptWordCount;
}

/**
 * wpm = từ đúng / phút theo **duration audio gốc** (spec §5.5 — client gửi
 * durationMs của file, không theo playbackRate). durationMs ≤ 0 → 0.
 */
export function computeWpm(diff: DiffResult, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return diff.matchedCount / (durationMs / 60000);
}

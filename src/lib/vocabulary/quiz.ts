/**
 * Quiz engine (SF-4 t-4.1) — PURE, không db/next (unit test trực tiếp, cùng
 * tách lớp srs.ts / review-store.ts). Sinh đề 10 câu xen kẽ 3 loại từ word
 * pool của 1 book — trắc nghiệm (4 phương án, nhiễu lấy từ words cùng book),
 * điền từ (gợi ý nghĩa → gõ word), ghép nghĩa (2 đề × 5 cặp). Chấm bài soi
 * pool phía server (đáp án đúng không bao giờ nằm trong payload GET).
 */

export const QUIZ_TYPES = [
  "multiple-choice",
  "fill-word",
  "matching",
] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];

/** Mode lưu quiz_attempts — "mixed" (đề xen kẽ mặc định) hoặc 1 loại đơn. */
export const QUIZ_MODES = ["mixed", ...QUIZ_TYPES] as const;
export type QuizMode = (typeof QUIZ_MODES)[number];
export const QUIZ_MODE_DEFAULT: QuizMode = "mixed";

/**
 * Phạm vi pool đề (SF-3 t-3.2 — quiz tổng hub): 1 book (flow cũ), toàn bảng
 * words (kể cả từ độc lập), hoặc hợp nhiều book (từ chung 2 book chỉ vào đề
 * 1 lần). submitQuizAttempt persist quiz_attempts.book_id = bookId với scope
 * book, NULL với all/multi (attempt không thuộc 1 book cụ thể).
 */
export type QuizScope =
  | { kind: "book"; bookId: number }
  | { kind: "all" }
  | { kind: "multi"; bookIds: number[] };

/** Giới hạn IN-list khi scope multi — chặn query phình vô hạn. */
export const QUIZ_SCOPE_MULTI_MAX_BOOKS = 50;

export type QuizScopeParseResult =
  | { ok: true; scope: QuizScope }
  | { ok: false; error: "invalidScope" | "invalidBookId" | "invalidBookIds" };

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Chuẩn hoá scope từ API/URL — pure để unit test trực tiếp. scope "book"
 * cần bookId nguyên dương; "multi" cần bookIds 1..50 id nguyên dương (nhận
 * mảng lẫn chuỗi "1,2,3" từ querystring, trùng id gộp lại); giá trị khác →
 * invalidScope. caller tự xử lý trường hợp scope vắng mặt (tương thích
 * contract cũ ?book_id=).
 */
export function parseQuizScope(raw: {
  scope: string;
  bookId?: unknown;
  bookIds?: unknown;
}): QuizScopeParseResult {
  if (raw.scope === "all") return { ok: true, scope: { kind: "all" } };

  if (raw.scope === "book") {
    const bookId = positiveInt(raw.bookId);
    return bookId !== null
      ? { ok: true, scope: { kind: "book", bookId } }
      : { ok: false, error: "invalidBookId" };
  }

  if (raw.scope === "multi") {
    const rawIds: unknown[] = Array.isArray(raw.bookIds)
      ? raw.bookIds
      : typeof raw.bookIds === "string"
        ? raw.bookIds.split(",")
        : [];
    const ids = [
      ...new Set(
        rawIds.map((id) =>
          typeof id === "number" || typeof id === "string"
            ? positiveInt(id)
            : null,
        ),
      ),
    ];
    if (
      ids.length === 0 ||
      ids.some((id) => id === null) ||
      ids.length > QUIZ_SCOPE_MULTI_MAX_BOOKS
    ) {
      return { ok: false, error: "invalidBookIds" };
    }
    return {
      ok: true,
      scope: {
        kind: "multi",
        bookIds: ids.filter((id): id is number => id !== null),
      },
    };
  }

  return { ok: false, error: "invalidScope" };
}

/** 1 từ trong pool đề — nguồn duy nhất cho cả sinh đề lẫn chấm (DB-owned). */
export type QuizWord = {
  wordId: number;
  word: string;
  meaningVi: string;
  ipa: string | null;
};

export type MultipleChoiceQuestion = {
  type: "multiple-choice";
  wordId: number;
  word: string;
  ipa: string | null;
  /** 4 nghĩa (1 đúng + 3 nhiễu) đã xáo — KHÔNG kèm đáp án. */
  options: string[];
};

export type FillWordQuestion = {
  type: "fill-word";
  wordId: number;
  /** Gợi ý: nghĩa VI — user gõ word. */
  meaningVi: string;
  /** Độ dài word — gợi ý số chữ cái. */
  letterCount: number;
};

export type MatchingQuestion = {
  type: "matching";
  /** 5 từ (cột trái, thứ tự pool) + 5 nghĩa đã xáo độc lập (cột phải). */
  words: { wordId: number; word: string }[];
  meanings: string[];
};

export type QuizQuestion =
  | MultipleChoiceQuestion
  | FillWordQuestion
  | MatchingQuestion;

export type QuizAnswer = { wordId: number; type: QuizType; response: string };

export type QuizGradeDetailItem = QuizAnswer & { correct: boolean };

export type QuizGrade = {
  /** 0–1 cùng thang attempts.accuracy. */
  score: number;
  correct: number;
  total: number;
  detail: QuizGradeDetailItem[];
};

/** Đề 10 câu: xen kẽ trắc nghiệm/điền từ, chen 2 đề ghép (5 cặp mỗi đề). */
const SLOT_PATTERN: readonly QuizType[] = [
  "multiple-choice",
  "fill-word",
  "multiple-choice",
  "fill-word",
  "matching",
  "multiple-choice",
  "fill-word",
  "multiple-choice",
  "fill-word",
  "matching",
];

const MC_OPTIONS = 4;
const MATCH_PAIRS = 5;

/** So khớp đáp án/nhánh nhiễu chuẩn hoá — chặn mơ hồ do hoa thường/trailing. */
function normKey(value: string): string {
  return value.trim().toLowerCase();
}

type Rng = () => number;

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/**
 * Sinh đề từ pool (tốt nhất <= 10 câu). Mỗi slot lấy từ CHƯA dùng (không từ
 * nào lặp giữa các câu); slot không đủ điều kiện (nhiễu < 3, còn lại < 5 từ
 * cho ghép) bị bỏ qua — pool nhỏ thu ngắn đề, pool rỗng → [].
 * rng truyền vào để test tất định (mặc định Math.random).
 */
export function buildQuiz(
  pool: readonly QuizWord[],
  rng: Rng = Math.random,
): QuizQuestion[] {
  if (pool.length === 0) return [];

  const shuffled = shuffle(pool, rng);
  let cursor = 0;
  const take = (): QuizWord | null =>
    cursor < shuffled.length ? (shuffled[cursor++] as QuizWord) : null;

  // Trắc nghiệm cần >= 4 nghĩa phân biệt trong CẢ pool (đáp án + 3 nhiễu)
  const distinctMeanings = new Set(pool.map((w) => normKey(w.meaningVi)));
  const mcPossible = distinctMeanings.size >= MC_OPTIONS;

  const buildMultipleChoice = (): QuizQuestion | null => {
    if (!mcPossible) return null;
    const answer = take();
    if (!answer) return null;
    const answerKey = normKey(answer.meaningVi);
    const seen = new Set([answerKey]);
    const distractors: string[] = [];
    for (const candidate of shuffle(pool, rng)) {
      const key = normKey(candidate.meaningVi);
      if (seen.has(key)) continue;
      seen.add(key);
      distractors.push(candidate.meaningVi);
      if (distractors.length === MC_OPTIONS - 1) break;
    }
    return {
      type: "multiple-choice",
      wordId: answer.wordId,
      word: answer.word,
      ipa: answer.ipa,
      options: shuffle([answer.meaningVi, ...distractors], rng),
    };
  };

  const buildFillWord = (): QuizQuestion | null => {
    const answer = take();
    if (!answer) return null;
    return {
      type: "fill-word",
      wordId: answer.wordId,
      meaningVi: answer.meaningVi,
      letterCount: answer.word.length,
    };
  };

  const buildMatching = (): QuizQuestion | null => {
    const start = cursor;
    const picked: QuizWord[] = [];
    const seen = new Set<string>();
    while (cursor < shuffled.length && picked.length < MATCH_PAIRS) {
      const word = shuffled[cursor++] as QuizWord;
      const key = normKey(word.meaningVi);
      if (seen.has(key)) continue; // nghĩa trùng làm ghép mơ hồ — bỏ từ này
      seen.add(key);
      picked.push(word);
    }
    if (picked.length < MATCH_PAIRS) {
      cursor = start; // trả lại từ đã quét — slot sau vẫn dùng được
      return null;
    }
    return {
      type: "matching",
      words: picked.map((w) => ({ wordId: w.wordId, word: w.word })),
      meanings: shuffle(
        picked.map((w) => w.meaningVi),
        rng,
      ),
    };
  };

  const questions: QuizQuestion[] = [];
  for (const type of SLOT_PATTERN) {
    const question =
      type === "multiple-choice"
        ? buildMultipleChoice()
        : type === "fill-word"
          ? buildFillWord()
          : buildMatching();
    if (question) questions.push(question);
  }
  return questions;
}

/**
 * Chấm bài từ đáp án client gửi — so đáp án chuẩn hoá (trim + lowercase):
 * điền từ so với `word`, trắc nghiệm/ghép so với `meaningVi`. wordId ngoài
 * pool (route đã chặn trước) chỉ phòng thủ → sai. score = đúng/tổng.
 */
export function gradeQuiz(
  pool: readonly QuizWord[],
  answers: readonly QuizAnswer[],
): QuizGrade {
  const byId = new Map(pool.map((w) => [w.wordId, w]));
  const detail = answers.map((answer) => {
    const word = byId.get(answer.wordId);
    let correct = false;
    if (word) {
      const response = normKey(answer.response);
      correct =
        answer.type === "fill-word"
          ? response === normKey(word.word)
          : response === normKey(word.meaningVi);
    }
    return { ...answer, correct };
  });
  const total = detail.length;
  const correct = detail.filter((item) => item.correct).length;
  return { score: total === 0 ? 0 : correct / total, correct, total, detail };
}

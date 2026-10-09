/**
 * Session engine thuần (vocab-memrise SF-2, VU-39 — context pack #1-5, epic
 * spec §2.1/§2.2/§5). PURE, không db/next (cùng tách lớp srs.ts ⋈
 * review-store.ts — store DB leg ở learn-session-store.ts).
 *
 * Contract CỨNG (pin learn-session.test.ts):
 * - Payload GET KHÔNG BAO GIỜ có cờ đáp án/đáp án chữ MC riêng — options gồm
 *   nghĩa đúng trộn nhiễu KHÔNG đánh dấu; `meaningVi` CHỈ xuất hiện ở step
 *   type (prompt) + card introduce; `word` ẩn ở listen/type (nghe-chọn/gõ-từ).
 * - gradeStep CHỈ chấm, không ghi gì; SRS ghi MỘT grade/từ/lượt qua store khi
 *   từ hoàn thành chuỗi (bước type) — qualityFromSteps quyết quality.
 * - rng inject để test tất định (mặc định Math.random — pattern buildQuiz).
 */

export const SESSION_KINDS = ["learn", "review"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export function isSessionKind(value: unknown): value is SessionKind {
  return (
    typeof value === "string" &&
    (SESSION_KINDS as readonly string[]).includes(value)
  );
}

export const STEP_KINDS = ["introduce", "mc", "listen", "type"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export function isStepKind(value: unknown): value is StepKind {
  return (
    typeof value === "string" &&
    (STEP_KINDS as readonly string[]).includes(value)
  );
}

/** Bước CHẤM ĐƯỢC — introduce là card giới thiệu, không phải bước test. */
export type TestStepKind = Exclude<StepKind, "introduce">;

/** Số từ mới tối đa 1 lượt learn (epic §2.1 — phiên 5 từ, pin acceptance). */
export const LEARN_SESSION_WORDS = 5;

/**
 * 1 từ của phiên — store JOIN sẵn words cho queue (SQL-side chọn, bounded).
 * Dùng chung cho learn (level rows) lẫn review (due rows).
 */
export type SessionWord = {
  wordId: number;
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
};

/**
 * 1 bước của phiên (payload GET — client render theo stepIndex, thứ tự do
 * SERVER quyết). Field per kind:
 * - introduce: word + ipa? + audioUrl? + meaningVi + example? (card)
 * - mc:        word + ipa? + audioUrl? + options (chọn nghĩa — nhìn từ)
 * - listen:    audioUrl + options (chọn nghĩa — chỉ nghe, KHÔNG word/ipa)
 * - type:      meaningVi (PROMPT — gõ word; word ẩn)
 * KHÔNG có field đáp án nào (answer/correct/isCorrect) — test no-leak pin.
 */
export type SessionStep = {
  stepIndex: number;
  kind: StepKind;
  wordId: number;
  word?: string;
  ipa?: string | null;
  audioUrl?: string | null;
  options?: string[];
  meaningVi?: string;
  example?: string;
};

/** Body POST /api/vocabulary/session — chấm 1 bước (spec §5). */
export type GradeRequest = {
  sessionKey: string;
  kind: SessionKind;
  bookId: number;
  wordId: number;
  stepIndex: number;
  attemptNo: number;
  stepKind: StepKind;
  response: string;
};

/** Trạng thái SRS sau grade (bước type — từ hoàn thành lượt). */
export type StepGrade = {
  quality: number;
  ease: number;
  intervalDays: number;
  reps: number;
  /** ISO string — payload JSON. */
  dueAt: string;
};

/** Kết quả applyStep — `grade` chỉ có khi từ hoàn thành lượt (bước type). */
export type GradeResult = {
  correct: boolean;
  grade: StepGrade | null;
  xpAwarded: number;
  xpCapped: boolean;
  totalXp: number;
  streak: number;
  goalDone: boolean;
};

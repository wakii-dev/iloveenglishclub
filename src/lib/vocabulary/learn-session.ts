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

type Rng = () => number;

/** Chuẩn hoá so khớp — trim + lowercase + collapse space (style normKey quiz.ts). */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

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

/** Số lựa chọn MC tối đa (epic §2.1 — pin degenerate tests). */
export const MC_MAX_OPTIONS = 4;

/**
 * Options MC/listen từ pool distractor: nghĩa đúng + các nghĩa PHÂN BIỆT
 * (normKey) khác trong pool, tối đa MC_MAX_OPTIONS. Trả null khi <2 nghĩa
 * phân biệt (bỏ step MC — sách 1 nghĩa không làm trắc nghiệm).
 */
export function buildMcOptions(
  correctMeaning: string,
  distractorPool: readonly string[],
  rng: Rng,
): string[] | null {
  const correctKey = normalizeAnswer(correctMeaning);
  const seen = new Set([correctKey]);
  const distractors: string[] = [];
  for (const candidate of distractorPool) {
    const key = normalizeAnswer(candidate);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    distractors.push(candidate);
  }
  const total = 1 + distractors.length;
  if (total < 2) return null; // <2 nghĩa phân biệt → bỏ MC
  const optionCount = Math.min(MC_MAX_OPTIONS, total);
  return shuffle(
    [correctMeaning, ...distractors.slice(0, optionCount - 1)],
    rng,
  );
}

export type BuildLearnStepsInput = {
  /** Từ reps=0 của level kế tiếp (≤ LEARN_SESSION_WORDS, order tăng — store chọn). */
  words: readonly SessionWord[];
  /** Pool nhiễu MC — meaning_vi các từ cùng book (bounded store-side). */
  distractorPool: readonly string[];
  rng?: Rng;
};

/**
 * Build phiên LEARN (epic §2.1): chuỗi per từ introduce → mc? → listen? →
 * type; ĐAN XEN batch ~2 từ mới — intro của 2 từ mới chen giữa các
 * test-chain (server quyết thứ tự cuối). Bước MC BỎ khi pool <2 nghĩa phân
 * biệt; listen CHỈ khi audioUrl != null; từ không audio đi thẳng mc→type.
 */
export function buildLearnSteps(input: BuildLearnStepsInput): SessionStep[] {
  const rng = input.rng ?? Math.random;
  const steps: SessionStep[] = [];
  let stepIndex = 0;

  const pushIntroduce = (w: SessionWord): void => {
    steps.push({
      stepIndex: stepIndex++,
      kind: "introduce",
      wordId: w.wordId,
      word: w.word,
      ipa: w.ipa,
      audioUrl: w.audioUrl,
      meaningVi: w.meaningVi,
      example: w.example ?? undefined,
    });
  };

  const pushTestChain = (w: SessionWord): void => {
    const options = buildMcOptions(w.meaningVi, input.distractorPool, rng);
    if (options) {
      steps.push({
        stepIndex: stepIndex++,
        kind: "mc",
        wordId: w.wordId,
        word: w.word,
        ipa: w.ipa,
        audioUrl: w.audioUrl,
        options,
      });
    }
    if (w.audioUrl != null) {
      steps.push({
        stepIndex: stepIndex++,
        kind: "listen",
        wordId: w.wordId,
        audioUrl: w.audioUrl,
        options: options ? [...options] : undefined,
      });
    }
    steps.push({
      stepIndex: stepIndex++,
      kind: "type",
      wordId: w.wordId,
      meaningVi: w.meaningVi,
    });
  };

  // Đan xen: giới thiệu theo batch 2 từ mới, rồi test-chain từng từ của batch
  for (let i = 0; i < input.words.length; i += 2) {
    const batch = input.words.slice(i, i + 2);
    for (const word of batch) pushIntroduce(word);
    for (const word of batch) pushTestChain(word);
  }
  return steps;
}

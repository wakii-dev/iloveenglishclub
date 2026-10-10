/**
 * XP rules vocab (vocab-memrise SF-1, VU-38 — epic spec §4) — PURE,
 * client-safe, không db/next (cùng tách lớp srs.ts ⋈ review-store.ts).
 * Số 4/1/60 PIN trong vocab-xp.test.ts — khung cứng, không chỉnh lặt vặt.
 *
 * Anti-farm 3 lớp (§4):
 *  1. idempotency_key UNIQUE — lớp store (ON CONFLICT DO NOTHING)
 *  2. lần-đầu-trong-ngày / learn-complete-lần-đầu — flag DB truyền vào
 *     computeXpAward (chặn farm qua regrade/attemptNo mới/prefill URL)
 *  3. cap 60 XP/ngày — phần dư, tổng vocab XP ngày không vượt cap
 */

export const LEARN_COMPLETE_XP = 4;
export const STEP_XP = 1;
export const DAILY_XP_CAP = 60;

/** 2 kind schema CHECK `vocab_activity_kind_check` nhận. */
export const VOCAB_ACTIVITY_KINDS = ["learn-complete", "session-step"] as const;
export type VocabActivityKind = (typeof VOCAB_ACTIVITY_KINDS)[number];

export function isVocabActivityKind(value: unknown): value is VocabActivityKind {
  return (
    typeof value === "string" &&
    (VOCAB_ACTIVITY_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Key chống double-submit — SERVER derive (client không gửi key, spec §5):
 * `${userId}:${sessionKey}:${wordId}:${stepIndex}:${attemptNo}`.
 * attemptNo khác = instance mới (retry sau sai) — KHÔNG trùng key.
 */
export function idempotencyKey(
  userId: string,
  sessionKey: string,
  wordId: number,
  stepIndex: number,
  attemptNo: number,
): string {
  return `${userId}:${sessionKey}:${wordId}:${stepIndex}:${attemptNo}`;
}

export type XpAwardInput = {
  kind: VocabActivityKind;
  /** Kết quả chấm server-side — sai luôn 0 XP (row vẫn ghi audit). */
  correct: boolean;
  /** (user, word) đã có row `correct=true` hôm nay (VN) chưa — KHÁT row chuẩn bị ghi. */
  correctTodayExists: boolean;
  /** (user, word) đã tồn tại `kind='learn-complete'` chưa — 4 XP chỉ lần reps đầu vượt 0. */
  learnCompleteExists: boolean;
  /** Tổng XP vocab user đã nhận hôm nay (count trong transaction, trước khi ghi). */
  vocabXpToday: number;
};

export type XpAward = {
  xpAwarded: number;
  /** true khi ĐÚNG mà bị cap chặn (cạn/thiếu phần dư) — sai/lặp từ KHÔNG set cờ này. */
  xpCapped: boolean;
};

/**
 * Quyết XP cho 1 event chấm từ các flag đầu vào (store query trong transaction
 * rồi gọi — hàm thuần để test mọi tổ hợp mà không cần DB).
 * Thứ tự: sai → 0 · lặp (đã correct hôm nay / learn-complete đã tồn tại) → 0 ·
 * đủ điều kiện → min(XP-kind, cap − đã nhận hôm nay); thiếu phần dư = capped.
 */
export function computeXpAward(input: XpAwardInput): XpAward {
  if (!input.correct) return { xpAwarded: 0, xpCapped: false };

  // Lần-đầu: session-step 1 XP/bước chỉ lần ĐÚNG đầu trong ngày; learn-complete
  // 4 XP chỉ lần reps đầu vượt 0 (lặp từ → 0, KHÔNG set xpCapped — 0 vì
  // anti-farm, không phải vì cap).
  const eligible =
    input.kind === "learn-complete"
      ? !input.learnCompleteExists
      : !input.correctTodayExists;
  if (!eligible) return { xpAwarded: 0, xpCapped: false };

  const base = input.kind === "learn-complete" ? LEARN_COMPLETE_XP : STEP_XP;
  const remaining = Math.max(0, DAILY_XP_CAP - input.vocabXpToday);
  const xpAwarded = Math.min(base, remaining);
  return { xpAwarded, xpCapped: xpAwarded < base };
}

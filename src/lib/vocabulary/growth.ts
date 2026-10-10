/**
 * Growth stage — garden metaphor (vocab-memrise SF-1, VU-38 — epic spec
 * §2.4). PURE, không db/next (cùng tách lớp srs.ts). Map từ trạng thái SRS
 * SAU grade sang 8 mức "vườn ấm" — KHÔNG đổi engine SM-2 (boundary SF-1).
 * Bảng boundary CỨNG, pin trong growth.test.ts:
 *   0 Hạt mầm   reps = 0 (chưa planted — gồm mọi từ seed learn-flow)
 *   1 Nảy mầm   planted, intervalDays < 2
 *   2 Cây con   < 7        3 Nụ       < 14       4 Cây non  < 45
 *   5 Cây xanh  < 100      6 Trỗi dậy < 200      7 Nở hoa   ≥ 200
 * Hai khái niệm song song: "mastered" chip (reps ≥ MASTERED_REPS, library)
 * giữ nguyên — mastered đo reps, stage đo intervalDays.
 */

export type GrowthStageInput = {
  /** Số lần ôn thành công (user_word_progress.reps) — 0 = chưa planted. */
  reps: number;
  /** Số ngày giữa 2 lần ôn (user_word_progress.interval_days). */
  intervalDays: number;
};

export type GrowthStageMeta = {
  /** 0–7 — index đồng thời là mức stage. */
  stage: number;
  /** i18n key label — messages/{en,vi}/learn.json `learn.stage.<n>`. */
  nameKey: string;
};

export const GROWTH_STAGES: readonly GrowthStageMeta[] = Array.from(
  { length: 8 },
  (_, stage) => ({ stage, nameKey: `learn.stage.${stage}` }),
);

// Ngưỡng TRÊN (loại) của từng stage 1–6 — ≥ ngưỡng cuối là stage 7
const STAGE_UPPER_BOUNDS = [2, 7, 14, 45, 100, 200] as const;

/** Stage 0–7 của 1 từ theo trạng thái SRS hiện tại. */
export function growthStage({ reps, intervalDays }: GrowthStageInput): number {
  if (reps <= 0) return 0; // chưa planted — seed với interval còn nguyên vẫn 0
  const days = Math.max(0, intervalDays);
  for (let stage = 0; stage < STAGE_UPPER_BOUNDS.length; stage++) {
    if (days < STAGE_UPPER_BOUNDS[stage]) return stage + 1;
  }
  return 7;
}

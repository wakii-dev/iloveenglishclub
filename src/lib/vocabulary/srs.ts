/**
 * SRS engine SM-2 lite (SF-3 t-3.1) — PURE, không db/next (unit test trực
 * tiếp, cùng tách lớp lib/admin/vocabulary.ts).
 *
 * Rút gọn chuẩn SM-2:
 * - quality 0–5; <3 = quên → reset reps = 0, interval về 1 ngày (học lại)
 * - >=3 = nhớ → rep 1: 1 ngày, rep 2: 6 ngày, tiếp theo: interval × ease
 * - ease cập nhật theo công thức EF' = EF + (0.1 − (5−q)(0.08 + (5−q)0.02)),
 *   kẹp trong [1.3, 2.8] (cả ease đầu vào lỗi cũng được chặn ở OUTPUT clamp)
 * - dueAt = mốc review + interval ngày
 */

export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;
export const EASE_DEFAULT = 2.5;
export const QUALITY_MIN = 0;
export const QUALITY_MAX = 5;

const DAY_MS = 86_400_000;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;

export type SrsState = {
  /** Hệ số nhớ hiện tại (1.3–2.8) — mặc định 2.5 theo SM-2 (row mới). */
  ease: number;
  /** Số ngày giữa 2 lần ôn — 0 = chưa từng ôn (row mới). */
  intervalDays: number;
  /** Số lần ôn THÀNH CÔNG liên tiếp — quên (q<3) reset về 0. */
  reps: number;
};

export type SrsReview = {
  ease: number;
  intervalDays: number;
  dueAt: Date;
  /** reps sau lần ôn này — DB user_word_progress.reps cần giá trị mới. */
  reps: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tính trạng thái SRS kế tiếp sau 1 lần ôn. `now` truyền riêng để test
 * tất định (mặc định hiện tại). quality lẻ (4.5) làm tròn, ngoài biên 0–5
 * bị kẹp — route validate chặt trước khi gọi, engine luôn an toàn.
 */
export function nextReview(
  state: Partial<SrsState> & { quality: number },
  now: Date = new Date(),
): SrsReview {
  const quality = clamp(
    Math.round(state.quality),
    QUALITY_MIN,
    QUALITY_MAX,
  );
  // clamp đầu vào: row DB có thể bị sửa tay ease ngoài biên — output luôn hợp lệ
  const ease = clamp(state.ease ?? EASE_DEFAULT, EASE_MIN, EASE_MAX);
  const reps = Math.max(0, Math.trunc(state.reps ?? 0));
  const intervalDays = Math.max(0, Math.trunc(state.intervalDays ?? 0));

  // SM-2: EF' tính cho MỌI quality (kể cả quên) — ease vẫn trượt xuống khi quên
  const nextEase = clamp(
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    EASE_MIN,
    EASE_MAX,
  );

  let nextReps: number;
  let nextInterval: number;
  if (quality < 3) {
    nextReps = 0;
    nextInterval = FIRST_INTERVAL_DAYS;
  } else {
    nextReps = reps + 1;
    nextInterval =
      nextReps === 1
        ? FIRST_INTERVAL_DAYS
        : nextReps === 2
          ? SECOND_INTERVAL_DAYS
          : Math.max(FIRST_INTERVAL_DAYS, Math.round(intervalDays * nextEase));
  }

  return {
    ease: nextEase,
    intervalDays: nextInterval,
    dueAt: new Date(now.getTime() + nextInterval * DAY_MS),
    reps: nextReps,
  };
}

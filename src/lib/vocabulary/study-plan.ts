/**
 * Lịch trải từ mới (story vocabulary-learn t-1.2) — PURE, không db/next
 * (cùng tách lớp srs.ts ⋈ review-store.ts): "Bắt đầu học sách này" seed cả
 * book vào user_word_progress với due_at TRẢI STUDY_WORDS_PER_DAY từ/ngày
 * — word thứ i đến hạn ngày floor(i / perDay) kể từ mốc bắt đầu. `now`
 * truyền riêng để test tất định (mặc định hiện tại).
 */

export const STUDY_WORDS_PER_DAY = 5;

const DAY_MS = 86_400_000;

export function planStaggerDueDates(
  count: number,
  opts: { perDay?: number; now?: Date } = {},
): Date[] {
  const total = Math.max(0, Math.trunc(count));
  const perDay = Math.max(1, Math.trunc(opts.perDay ?? STUDY_WORDS_PER_DAY));
  const now = opts.now ?? new Date();
  return Array.from(
    { length: total },
    (_, i) => new Date(now.getTime() + Math.floor(i / perDay) * DAY_MS),
  );
}

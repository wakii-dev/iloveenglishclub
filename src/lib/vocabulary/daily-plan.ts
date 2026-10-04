/**
 * Kế hoạch ngày + streak (story vocabulary-learn t-1.5) — PURE, không db/next
 * (cùng tách lớp srs.ts ⋈ review-store.ts). Derive TRỰC TIẾP từ
 * user_word_progress — KHÔNG bảng mới (mindmap t-1.5): X từ mới từ queue
 * (reps 0 đến hạn) + Y ôn due (reps > 0 đến hạn) + hàng chờ những ngày tới +
 * thành thạo (MASTERED_REPS hub-status) + streak VN. Streak tái dùng
 * vnToday/computeStreak gamification (TZ Asia/Ho_Chi_Minh — quyết định #13)
 * trên các ngày distinct của last_reviewed_at.
 */
import { MASTERED_REPS } from "./hub-status";
import { computeStreak, vnToday } from "@/lib/gamification/streak";

export type DailyPlanRow = {
  reps: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
};

export type DailyPlan = {
  /** Từ mới đến hạn hôm nay (reps 0 — queue seed trải 5 từ/ngày t-1.2). */
  newDue: number;
  /** Từ đã học ít nhất 1 lần, đến hạn ôn hôm nay. */
  reviewDue: number;
  /** newDue + reviewDue — tổng thẻ /me/vocabulary ôn hôm nay. */
  totalDue: number;
  /** Hàng trong lộ trình chưa đến hạn (những ngày tới). */
  upcoming: number;
  /** Tổng số từ trong lộ trình. */
  total: number;
  /** Đã thành thạo (reps ≥ MASTERED_REPS). */
  mastered: number;
  /** Chuỗi ngày học liên tục (last_reviewed_at, VN) — 0 khi chưa học. */
  streakDays: number;
};

export const EMPTY_DAILY_PLAN: DailyPlan = {
  newDue: 0,
  reviewDue: 0,
  totalDue: 0,
  upcoming: 0,
  total: 0,
  mastered: 0,
  streakDays: 0,
};

export function buildDailyPlan(
  rows: readonly DailyPlanRow[],
  now: Date = new Date(),
): DailyPlan {
  let newDue = 0;
  let reviewDue = 0;
  let upcoming = 0;
  let mastered = 0;
  const reviewedDays = new Set<string>();
  for (const row of rows) {
    if (row.dueAt.getTime() <= now.getTime()) {
      if (row.reps === 0) newDue++;
      else reviewDue++;
    } else {
      upcoming++;
    }
    if (row.reps >= MASTERED_REPS) mastered++;
    if (row.lastReviewedAt !== null) {
      reviewedDays.add(vnToday(row.lastReviewedAt));
    }
  }
  return {
    newDue,
    reviewDue,
    totalDue: newDue + reviewDue,
    upcoming,
    total: rows.length,
    mastered,
    streakDays: computeStreak([...reviewedDays], vnToday(now)),
  };
}

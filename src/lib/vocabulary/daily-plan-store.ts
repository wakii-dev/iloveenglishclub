/**
 * Store kế hoạch ngày (story vocabulary-learn t-1.5) — select 3 cột của
 * user_word_progress rồi buildDailyPlan (pure daily-plan.ts). Data cá nhân →
 * query live, không cache (cùng listHubWords); limit 5000 chặn phình (book
 * lớn seed cả nghìn row — vẫn dư cho lộ trình cá nhân). DB lỗi (bảng chưa
 * migrate) → EMPTY_DAILY_PLAN build-safe (cùng fallback listDueWords).
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userWordProgress } from "@/db/schema";
import { buildDailyPlan, EMPTY_DAILY_PLAN, type DailyPlan } from "./daily-plan";

export const DAILY_PLAN_ROW_LIMIT = 5000;

export async function getDailyPlan(
  userId: string,
  now: Date = new Date(),
): Promise<DailyPlan> {
  try {
    const rows = await db
      .select({
        reps: userWordProgress.reps,
        dueAt: userWordProgress.dueAt,
        lastReviewedAt: userWordProgress.lastReviewedAt,
      })
      .from(userWordProgress)
      .where(eq(userWordProgress.userId, userId))
      .limit(DAILY_PLAN_ROW_LIMIT);
    return buildDailyPlan(rows, now);
  } catch (error) {
    console.error("[vocabulary:getDailyPlan] query failed:", error);
    return EMPTY_DAILY_PLAN;
  }
}

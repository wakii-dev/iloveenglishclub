/**
 * Streak recompute + shield consume (daily-journey SF-4, VU-52 — context
 * pack §1): Hàm DUY NHẤT trong nền được tạo freeze rows. SF-4 chỉ rewire 2
 * write-paths (submit-attempt, vocab-xp-store) gọi hàm này thay block
 * inline-recompute — mọi hành vi khác (tx shape, FOR UPDATE, idempotency)
 * giữ nguyên caller.
 *
 * PRECONDITION: caller đã `SELECT profiles ... FOR UPDATE` trong CÙNG tx
 * (cả 2 write-path đều vậy) — đọc shield_credits ở đây thấy row đã khoá,
 * consume serialise với grant tx của today-store (single-statement least()).
 *
 * ⚠ FREEZE-MERGE CONTRACT (shield-planner caller note): `dates` đưa
 * planFreezes phải là ngày active HIỆU LỰC = daily_activity CỘNG freeze cũ
 * — nếu không, recompute lặp cùng ngày plan lại gap đã freeze: INSERT
 * no-op theo PK nhưng credits bị trừ lần 2. Union ở bước (2) là chống
 * double-burn, đã pin test streak-store.test.ts.
 */
import { desc, eq } from "drizzle-orm";
import type { db } from "@/db";
import { dailyActivity, profiles, streakFreezes } from "@/db/schema";
import { computeStreak } from "./streak";
import { planFreezes } from "./shield-planner";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const STREAK_LOOKBACK_DAYS = 400; // streak >400 ngày v1 chưa tồn tại — cap hợp lý (pattern caller)

/**
 * Recompute streak trong transaction CÓ SẼN, tiêu shield credits bắc cầu
 * ngày lỡ (plan SF-1 — cap 2, lookback 7, gần nhất trước). Trả về streak
 * mới (computeStreak trên activity ∪ toàn bộ freeze — cũ lẫn mới tạo).
 */
export async function recomputeStreakTx(
  tx: Tx,
  userId: string,
  today: string,
): Promise<number> {
  // (a) activity dates + freeze dates + credits — MỌI read trong tx đã
  // FOR UPDATE bởi caller, không race với consume/grant khác cùng user
  const activityDates = await tx
    .select({ date: dailyActivity.date })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId))
    .orderBy(desc(dailyActivity.date))
    .limit(STREAK_LOOKBACK_DAYS);
  const freezeRows = await tx
    .select({ date: streakFreezes.date })
    .from(streakFreezes)
    .where(eq(streakFreezes.userId, userId));
  const [profile] = await tx
    .select({ shieldCredits: profiles.shieldCredits })
    .from(profiles)
    .where(eq(profiles.id, userId));

  const dates = activityDates.map((r) => r.date);
  const oldFreezes = freezeRows.map((r) => r.date);

  // (b) kế hoạch freeze — dates = activity ∪ freeze cũ (chống double-burn)
  const { freezeDates, creditsLeft } = planFreezes(
    [...dates, ...oldFreezes],
    today,
    profile?.shieldCredits ?? 0,
  );

  // (c) áp dụng kế hoạch — chỉ khi có freeze mới (0-plan ⇒ zero write,
  // identity 0-credit không đụng gì thêm)
  if (freezeDates.length > 0) {
    await tx
      .insert(streakFreezes)
      .values(freezeDates.map((date) => ({ userId, date })))
      .onConflictDoNothing({
        target: [streakFreezes.userId, streakFreezes.date],
      });
    await tx
      .update(profiles)
      .set({ shieldCredits: creditsLeft })
      .where(eq(profiles.id, userId));
  }

  // (d) streak mới — freeze set ĐẦY ĐỦ (cũ + mới) đều bridge
  return computeStreak(dates, today, new Set([...oldFreezes, ...freezeDates]));
}

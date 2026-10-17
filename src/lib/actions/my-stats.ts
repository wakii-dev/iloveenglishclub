"use server";

import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { dailyActivity, profiles, vocabActivity } from "@/db/schema";
import { vnToday } from "@/lib/gamification/streak";

/**
 * Đọc XP + streak cache + goalDone kép cho header/nav-dot (daily-journey
 * SF-3, VU-51 — spec §2.6; trước đó context pack #8 "XP header live").
 * streak là CACHE profiles (hành vi sẵn có — giữ nguyên); goalDone là số
 * THẬT hôm nay (VN-day): phút nghe (daily_activity.listen_ms floor) ≥
 * daily_goal_minutes AND practicedToday ≥ daily_goal_words — practiced
 * mirror §3.5 today-store (DISTINCT word ĐÚNG, learn-complete +
 * session-step). 2 query nhỏ thêm — client nghe event `ilec:stats-updated`
 * (events.ts) để re-fetch sau mỗi submit (dictation + session-runner).
 * Guest → null.
 */
export async function readMyStats(): Promise<{
  xp: number;
  streak: number;
  goalDone: boolean;
} | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const today = vnToday(new Date());
  const vnDay =
    sql`(${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date`;

  const [profileRows, activityRows, practicedRows] = await Promise.all([
    db
      .select({
        xp: profiles.xp,
        streakCount: profiles.streakCount,
        dailyGoalMinutes: profiles.dailyGoalMinutes,
        dailyGoalWords: profiles.dailyGoalWords,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1),
    db
      .select({ listenMs: dailyActivity.listenMs })
      .from(dailyActivity)
      .where(
        and(eq(dailyActivity.userId, userId), eq(dailyActivity.date, today)),
      )
      .limit(1),
    db
      .select({
        practiced:
          sql<number>`count(distinct ${vocabActivity.wordId}) filter (where ${vocabActivity.correct} and ${vocabActivity.kind} in ('learn-complete', 'session-step') and ${vnDay} = ${today}::date)`.mapWith(
            Number,
          ),
      })
      .from(vocabActivity)
      .where(eq(vocabActivity.userId, userId)),
  ]);

  const profile = profileRows[0];
  if (!profile) return null;

  // goal kép §2.2 — floor phút như today-store (listenMinutesToday)
  const minutesDone =
    Math.floor((activityRows[0]?.listenMs ?? 0) / 60_000) >=
    profile.dailyGoalMinutes;
  const wordsDone = (practicedRows[0]?.practiced ?? 0) >= profile.dailyGoalWords;

  return {
    xp: profile.xp,
    streak: profile.streakCount,
    goalDone: minutesDone && wordsDone,
  };
}

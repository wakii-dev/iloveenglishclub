"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  attempts,
  dailyActivity,
  lessonParts,
  lessons,
  profiles,
  userLessonProgress,
} from "@/db/schema";
import { scoreAttempt } from "@/lib/dictation/diff";
import { computeStreak, vnToday } from "@/lib/gamification/streak";

/**
 * Submit attempt (SF-6 — spec §4, CHỐT CỨNG trust boundary):
 * client CHỈ gửi partId + typed_text + client_attempt_id + used_hint (event
 * flag — KHÔNG phải score). Server recompute toàn bộ bằng pure module SF-3
 * (scoreAttempt); mode (strict/relaxed) lấy từ profiles.relaxed_mode —
 * relaxed là XP economy nên KHÔNG tin client.
 *
 * "Service-role phía server" (mapping pivot SF-1 — epic VU-15): Neon Postgres
 * KHÔNG có RLS — db direct server-only query này chính là privileged path;
 * authorization = app-level (userId từ auth(), không nhận từ client).
 *
 * MỘT transaction:
 *  1. SELECT profiles FOR UPDATE — serialize submit cùng user (chống race
 *     double-XP 2 tabSubmit khác client_attempt_id cùng lúc)
 *  2. count attempts (user, part) → isFirst (XP chỉ attempt đầu — chống farm)
 *  3. INSERT attempts ON CONFLICT (user,part,client) DO NOTHING RETURNING —
 *     duplicate (Enter đôi nhanh, retry) → ok:true KHÔNG cộng gì (idempotent)
 *  4. attempt đầu của part → xp += (single statement atomic, không
 *     read-modify-write); daily_activity upsert (+1 nếu là part ĐẦU TIÊN
 *     trong ngày — distinct parts/ngày, re-check không phình counter)
 *  5. streak recompute từ daily_activity (source of truth) → cache profiles
 *  6. user_lesson_progress upsert — done_parts recompute live (accuracy ≥ 1),
 *     best_accuracy = GREATEST
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TYPED_LEN = 2000;

export interface SubmitAttemptResult {
  ok: boolean;
  /** attempt đã tồn tại (client_attempt_id trùng) — KHÔNG cộng gì lần 2. */
  duplicate?: boolean;
  xpAwarded: number;
  totalXp: number;
  streak: number;
  error?: "unauthorized" | "badInput" | "partNotFound" | "noProfile" | "serverError";
}

export async function submitAttempt(input: {
  partId: number;
  typedText: string;
  usedHint: boolean;
  clientAttemptId: string;
}): Promise<SubmitAttemptResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "unauthorized" };

    const { partId, typedText, usedHint, clientAttemptId } = input;
    if (
      !Number.isInteger(partId) ||
      partId <= 0 ||
      typeof typedText !== "string" ||
      typedText.length === 0 ||
      typedText.length > MAX_TYPED_LEN ||
      typeof usedHint !== "boolean" ||
      typeof clientAttemptId !== "string" ||
      !UUID_RE.test(clientAttemptId)
    ) {
      return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "badInput" };
    }

    // Part + lesson published (draft không tính điểm — publish gate §6.3)
    const [part] = await db
      .select({
        id: lessonParts.id,
        lessonId: lessons.id,
        text: lessonParts.text,
        durationMs: lessonParts.durationMs,
        published: lessons.published,
      })
      .from(lessonParts)
      .innerJoin(lessons, eq(lessons.id, lessonParts.lessonId))
      .where(eq(lessonParts.id, partId))
      .limit(1);
    if (!part || !part.published) {
      return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "partNotFound" };
    }

    const today = vnToday(new Date());

    return await db.transaction(async (tx): Promise<SubmitAttemptResult> => {
      const [profile] = await tx
        .select({
          xp: profiles.xp,
          streakCount: profiles.streakCount,
          relaxedMode: profiles.relaxedMode,
        })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .for("update");
      if (!profile) {
        return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "noProfile" };
      }

      // count tổng (isFirst) + count hôm nay (isFirstToday) — MỘT query,
      // đánh giá TRƯỚC insert (row vừa insert sẽ nhiễu filter hôm nay)
      const [counts] = await tx
        .select({
          total: sql<number>`count(*)::int`,
          todayCount: sql<number>`count(*) filter (where (created_at at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date)::int`,
        })
        .from(attempts)
        .where(and(eq(attempts.userId, userId), eq(attempts.partId, partId)));
      const isFirst = (counts?.total ?? 0) === 0;
      const isFirstToday = (counts?.todayCount ?? 0) === 0;

      const mode = profile.relaxedMode ? "relaxed" : "strict";
      const score = scoreAttempt({
        transcript: part.text,
        typed: typedText,
        mode,
        durationMs: part.durationMs,
        usedHint,
        isFirstAttempt: isFirst,
      });

      const inserted = await tx
        .insert(attempts)
        .values({
          userId,
          partId,
          typedText,
          accuracy: score.accuracy,
          wpm: score.wpm,
          xp: score.xp, // attempts sau attempt đầu ghi xp=0 (chống farm §5.5)
          clientAttemptId,
        })
        .onConflictDoNothing({
          target: [attempts.userId, attempts.partId, attempts.clientAttemptId],
        })
        .returning({ id: attempts.id });

      if (inserted.length === 0) {
        // Enter đôi nhanh / retry — unique constraint chặn, KHÔNG cộng gì
        return { ok: true, duplicate: true, xpAwarded: 0, totalXp: profile.xp, streak: profile.streakCount };
      }

      // daily_activity + streak — chỉ lần đầu part xuất hiện trong ngày
      let streak = profile.streakCount;
      if (isFirstToday) {
        await tx
          .insert(dailyActivity)
          .values({ userId, date: today, partsDone: 1 })
          .onConflictDoUpdate({
            target: [dailyActivity.userId, dailyActivity.date],
            set: { partsDone: sql`${dailyActivity.partsDone} + 1` },
          });
        const activityDates = await tx
          .select({ date: dailyActivity.date })
          .from(dailyActivity)
          .where(eq(dailyActivity.userId, userId))
          .orderBy(desc(dailyActivity.date))
          .limit(400); // streak >400 ngày v1 chưa tồn tại — cap hợp lý
        streak = computeStreak(
          activityDates.map((r) => r.date),
          today,
        );
      }

      const [updated] = await tx
        .update(profiles)
        .set({
          // single statement atomic (§4) — xp chỉ cộng khi attempt đầu
          xp: sql`${profiles.xp} + ${isFirst ? score.xp : 0}`,
          streakCount: streak,
          lastActiveDate: today,
        })
        .where(eq(profiles.id, userId))
        .returning({ xp: profiles.xp });

      // Progress upsert (mọi attempt, kể cả sau attempt đầu): done_parts
      // recompute live từ attempts (accuracy ≥ 1 — see plan decision 6);
      // subquery trong cùng transaction thấy row vừa insert.
      const donePartsExpr = sql<number>`(select count(distinct a.part_id)::int from attempts a join lesson_parts p on p.id = a.part_id where a.user_id = ${userId} and p.lesson_id = ${part.lessonId} and a.accuracy >= 1)`;
      await tx
        .insert(userLessonProgress)
        .values({
          userId,
          lessonId: part.lessonId,
          doneParts: donePartsExpr,
          bestAccuracy: score.accuracy,
        })
        .onConflictDoUpdate({
          target: [userLessonProgress.userId, userLessonProgress.lessonId],
          set: {
            doneParts: donePartsExpr,
            bestAccuracy: sql`greatest(coalesce(${userLessonProgress.bestAccuracy}, 0), ${score.accuracy})`,
            updatedAt: new Date(),
          },
        });

      return {
        ok: true,
        xpAwarded: isFirst ? score.xp : 0,
        totalXp: updated?.xp ?? profile.xp,
        streak,
      };
    });
  } catch (error) {
    console.error("[submit-attempt] failed:", error);
    return { ok: false, xpAwarded: 0, totalXp: 0, streak: 0, error: "serverError" };
  }
}

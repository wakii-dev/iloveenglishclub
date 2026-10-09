/**
 * XP vocab DB leg (vocab-memrise SF-1, VU-38 — context pack #5, epic §4).
 * MỘT transaction theo pattern submit-attempt.ts:
 *  1. SELECT profiles FOR UPDATE — serialize submit cùng user (chống race
 *     double-XP 2 request khác idempotency_key cùng lúc)
 *  2. flags anti-farm: (user, word) đã correct-hôm-nay + learn-complete tồn tại
 *     (MỘT query 2 filter) + tổng XP vocab hôm nay (cap)
 *  3. INSERT vocab_activity ON CONFLICT DO NOTHING theo idempotency_key —
 *     duplicate trả kết quả cached KHÔNG ghi thêm (caller SF-2 bỏ qua SRS)
 *  4. cộng profiles.xp có điều kiện (single statement atomic) + last_active
 *  5. upsert daily_activity vocab_steps +1 — presence row giữ streak; ngày
 *     chuyển active → recompute streak (computeStreak source of truth)
 *
 * Tách 2 mức cho SF-2 compose: awardVocabXpTx chạy trong transaction CÓ SẼN
 * (applyStep ghép chung với grade SRS — spec §4 "ghi MỘT transaction"),
 * awardVocabXp tự mở transaction cho dùng độc lập/test. Auth là việc ROUTE
 * (SF-2) — store chỉ nhận userId đã qua session.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyActivity, profiles, vocabActivity } from "@/db/schema";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import { computeStreak, vnToday } from "@/lib/gamification/streak";
import {
  computeXpAward,
  idempotencyKey,
  type VocabActivityKind,
} from "./vocab-xp";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AwardVocabXpParams = {
  userId: string;
  wordId: number;
  kind: VocabActivityKind;
  /** Kết quả chấm server-side — store KHÔNG chấm lại. */
  correct: boolean;
  sessionKey: string;
  stepIndex: number;
  attemptNo: number;
};

export type AwardVocabXpResult = {
  /** true = idempotency_key trùng — XP/SRS/activity đã áp dụng lần trước. */
  duplicate: boolean;
  xpAwarded: number;
  xpCapped: boolean;
  totalXp: number;
  streak: number;
  error?: "noProfile" | "wordNotFound";
};

const STREAK_LOOKBACK_DAYS = 400; // streak >400 ngày v1 chưa tồn tại — cap hợp lý (pattern submit-attempt)

/** Core trong transaction có sẵn — SF-2 gọi trong applyStep. */
export async function awardVocabXpTx(
  tx: Tx,
  params: AwardVocabXpParams,
): Promise<AwardVocabXpResult> {
  const { userId, wordId, kind, correct, sessionKey, stepIndex, attemptNo } =
    params;
  const today = vnToday(new Date());

  // 1. lock row user — mọi submit vocab cùng user serialize ở đây
  const [profile] = await tx
    .select({ xp: profiles.xp, streakCount: profiles.streakCount })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .for("update");
  if (!profile) {
    return {
      duplicate: false,
      xpAwarded: 0,
      xpCapped: false,
      totalXp: 0,
      streak: 0,
      error: "noProfile",
    };
  }

  // 2. flags anti-farm — đánh giá TRƯỚC insert (row vừa ghi sẽ nhiễu filter)
  const [wordFlags] = await tx
    .select({
      correctToday: sql<number>`count(*) filter (where ${vocabActivity.correct} and (${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date)::int`,
      learnComplete: sql<number>`count(*) filter (where ${vocabActivity.kind} = 'learn-complete')::int`,
    })
    .from(vocabActivity)
    .where(
      and(eq(vocabActivity.userId, userId), eq(vocabActivity.wordId, wordId)),
    );
  const [xpTodayRow] = await tx
    .select({
      xpToday: sql<number>`coalesce(sum(${vocabActivity.xp}) filter (where (${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date), 0)::int`,
    })
    .from(vocabActivity)
    .where(eq(vocabActivity.userId, userId));

  const award = computeXpAward({
    kind,
    correct,
    correctTodayExists: (wordFlags?.correctToday ?? 0) > 0,
    learnCompleteExists: (wordFlags?.learnComplete ?? 0) > 0,
    vocabXpToday: xpTodayRow?.xpToday ?? 0,
  });

  // 3. insert activity — UNIQUE idempotency_key là cửa chống double-submit
  const inserted = await tx
    .insert(vocabActivity)
    .values({
      userId,
      wordId,
      kind,
      correct,
      xp: award.xpAwarded,
      sessionKey,
      stepIndex,
      attemptNo,
      idempotencyKey: idempotencyKey(
        userId,
        sessionKey,
        wordId,
        stepIndex,
        attemptNo,
      ),
    })
    .onConflictDoNothing({ target: vocabActivity.idempotencyKey })
    .returning({ id: vocabActivity.id });
  if (inserted.length === 0) {
    // Enter đôi / retry cùng key — KHÔNG cộng gì, KHÔNG đếm vocab_steps lần 2
    return {
      duplicate: true,
      xpAwarded: 0,
      xpCapped: false,
      totalXp: profile.xp,
      streak: profile.streakCount,
    };
  }

  // 5. daily_activity upsert — MỌI event chấm (kể cả sai) là hoạt động:
  // presence row giữ streak, vocab_steps đếm bước đã chấm trong ngày
  const [existingToday] = await tx
    .select({ userId: dailyActivity.userId })
    .from(dailyActivity)
    .where(
      and(eq(dailyActivity.userId, userId), eq(dailyActivity.date, today)),
    )
    .limit(1);
  await tx
    .insert(dailyActivity)
    .values({ userId, date: today, vocabSteps: 1 })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.date],
      set: { vocabSteps: sql`${dailyActivity.vocabSteps} + 1` },
    });

  // streak recompute CHỈ khi ngày chuyển active (đã active → giữ cache)
  let streak = profile.streakCount;
  if (!existingToday) {
    const activityDates = await tx
      .select({ date: dailyActivity.date })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId))
      .orderBy(desc(dailyActivity.date))
      .limit(STREAK_LOOKBACK_DAYS);
    streak = computeStreak(
      activityDates.map((r) => r.date),
      today,
    );
  }

  // 4. cộng xp có điều kiện (0 khi sai/lặp/cap) — single statement atomic
  const [updated] = await tx
    .update(profiles)
    .set({
      xp: sql`${profiles.xp} + ${award.xpAwarded}`,
      streakCount: streak,
      lastActiveDate: today,
    })
    .where(eq(profiles.id, userId))
    .returning({ xp: profiles.xp });

  return {
    duplicate: false,
    xpAwarded: award.xpAwarded,
    xpCapped: award.xpCapped,
    totalXp: updated?.xp ?? profile.xp,
    streak,
  };
}

/** Standalone — tự mở transaction. FK 23503 → wordNotFound, lạ → rethrow. */
export async function awardVocabXp(
  params: AwardVocabXpParams,
): Promise<AwardVocabXpResult> {
  try {
    return await db.transaction((tx) => awardVocabXpTx(tx, params));
  } catch (error) {
    if (pgErrorCode(error) === "23503") {
      return {
        duplicate: false,
        xpAwarded: 0,
        xpCapped: false,
        totalXp: 0,
        streak: 0,
        error: "wordNotFound",
      };
    }
    throw error;
  }
}

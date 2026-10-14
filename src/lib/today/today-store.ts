/**
 * Today snapshot store — daily-journey SF-2 (VU-50, epic spec §3.2/§3.3/§3.4).
 * Nguồn dữ liệu THẬT cho /today (SF-3 UI) dựng trên libs thuần SF-1:
 *
 * Thực thi (pinned spec §3.2): (1) fan-out Promise.all các read nhánh độc
 * lập — mỗi nhánh fallback-safe riêng (một nhánh fail trả null/0, không đổ
 * snapshot — pattern dashboard-store/hub-store); (2) SAU fan-out MỘT tx ghi
 * nhỏ `await` TRONG snapshot (không fire-and-forget — serverless giết sau
 * response): monthly grant + quest auto-record + badge lazy-award, mỗi bước
 * INSERT ... ON CONFLICT DO NOTHING RETURNING (idempotent — reload/rerender
 * không lặp). Tx fail → snapshot VẪN TRẢ (read đã có), log, không throw.
 *
 * Thứ tự fan-out (15 chain — pin trong today-store.test.ts):
 * profile → daily_activity → vocab-aggregates → hubStats → dictation(2) →
 * continue(2) → quests-today → quest-count → badges → freezes →
 * badge-aggregates(3).
 *
 * Streak LIVE freeze-aware: computeStreak(dates, today, freezeSet) — SF-2
 * CHỈ ĐỌC streak_freezes (display), KHÔNG consume — consume là recomputeStreakTx
 * (SF-4 wiring).
 *
 * Unify counter §3.5: practicedToday = COUNT(DISTINCT word_id) ĐÚNG hôm nay
 * (VN) kind IN ('learn-complete','session-step') — cùng semantics ring
 * /vocabulary + POST goalDone (2 call sites learn-session-store).
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  books,
  dailyActivity,
  lessonParts,
  lessons,
  profiles,
  questCompletions,
  shieldGrants,
  streakFreezes,
  userBadges,
  userLessonProgress,
  userWordProgress,
  units,
  vocabActivity,
} from "@/db/schema";
import {
  SHIELD_CAP,
} from "@/lib/gamification/shield-planner";
import { computeStreak, vnToday } from "@/lib/gamification/streak";
import { getContinueTarget, type ContinueCard } from "@/lib/vocabulary/dashboard-store";
import { getHubStats } from "@/lib/vocabulary/hub-store";
import { evalBadges, type BadgeStats } from "./badges";
import { QUEST_POOL, selectQuests, type QuestId, type QuestMetric, type QuestTarget } from "./quests";
import { dualGoalStatus, type DualGoalStatus } from "./today-engine";

const STREAK_LOOKBACK_DAYS = 400; // như dashboard-store/vocab-xp-store — cap v1
const DEFAULT_GOAL_MINUTES = 10; // profiles.daily_goal_minutes default 0007
const DEFAULT_GOAL_WORDS = 5; // profiles.daily_goal_words default 0005

export type TodayQuest = {
  questId: QuestId;
  progress: number;
  target: number;
  done: boolean;
  /** Đã có row quest_completions hôm nay (trước hoặc do tx snapshot này). */
  recorded: boolean;
};

/** Card "Bài nghe kế tiếp" (§3.4) — deep-link /books/{book}/units/{unit}/lessons/{n}/listen-and-type. */
export type DictationNextCard = {
  bookSlug: string;
  unitNumber: number;
  lessonNumber: number;
  /** titleEn (source of truth) — UI localize qua titleVi. */
  title: string;
  titleVi: string | null;
  doneParts: number;
  totalParts: number;
};

export type TodaySnapshot = {
  date: string;
  listenMinutesToday: number;
  dailyGoalMinutes: number;
  practicedToday: number;
  plantedToday: number;
  dailyGoalWords: number;
  partsToday: number;
  dueToday: number;
  reviewedToday: number;
  /** LIVE computeStreak trên daily_activity + freezes — KHÔNG phải cache profiles. */
  streak: number;
  activeToday: boolean;
  goalDone: DualGoalStatus;
  dictationNext: DictationNextCard | null;
  vocabContinue: ContinueCard | null;
  /** ĐÚNG 3 quest hôm nay (§2.4 hash) theo thứ tự rank. */
  quests: TodayQuest[];
  newlyCompletedQuests: string[];
  newlyEarnedBadges: string[];
  /** Badge đã nhận (mọi mốc đạt — KHÔNG chỉ mới). */
  badges: string[];
  shield: { credits: number; cap: number; freezes: string[] };
};

// ---------------------------------------------------------------------------
// Fan-out reads — mỗi nhánh fallback-safe riêng
// ---------------------------------------------------------------------------

type ProfileGoalRow = {
  dailyGoalMinutes: number;
  dailyGoalWords: number;
  shieldCredits: number;
  streakCount: number;
};

async function readProfile(userId: string): Promise<ProfileGoalRow | null> {
  try {
    const [row] = await db
      .select({
        dailyGoalMinutes: profiles.dailyGoalMinutes,
        dailyGoalWords: profiles.dailyGoalWords,
        shieldCredits: profiles.shieldCredits,
        streakCount: profiles.streakCount,
      })
      .from(profiles)
      .where(eq(profiles.id, userId));
    return row ?? null;
  } catch (error) {
    console.error("[today:profile] query failed:", error);
    return null;
  }
}

type TodayActivityRow = {
  listenMs: number;
  partsDone: number;
  /** dates lookback 400 (desc) — streak + activeToday. */
  dates: string[];
};

async function readTodayActivity(userId: string): Promise<TodayActivityRow> {
  try {
    const rows = await db
      .select({
        date: dailyActivity.date,
        listenMs: dailyActivity.listenMs,
        partsDone: dailyActivity.partsDone,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId))
      .orderBy(desc(dailyActivity.date))
      .limit(STREAK_LOOKBACK_DAYS);
    return {
      listenMs: rows[0]?.listenMs ?? 0,
      partsDone: rows[0]?.partsDone ?? 0,
      dates: rows.map((r) => r.date),
    };
  } catch (error) {
    console.error("[today:activity] query failed:", error);
    return { listenMs: 0, partsDone: 0, dates: [] };
  }
}

/**
 * Aggregates vocab NGÀY VN (index vocab_activity_user_id_created_at_idx):
 * - practiced: DISTINCT word ĐÚNG, learn-complete + session-step (§3.5)
 * - planted: events learn-complete (giữ semantics cũ ring)
 * - reviewed: DISTINCT session-step TRỪ từ có learn-complete hôm nay (§2.4
 *   xấp-xỉ chủ đích — NOT EXISTS cùng bảng, index user+word)
 */
async function readVocabAggregates(
  userId: string,
  today: string,
): Promise<{ practiced: number; planted: number; reviewed: number }> {
  try {
    const vnDay =
      sql`(${vocabActivity.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date`;
    const [row] = await db
      .select({
        practiced:
          sql<number>`count(distinct ${vocabActivity.wordId}) filter (where ${vocabActivity.correct} and ${vocabActivity.kind} in ('learn-complete', 'session-step') and ${vnDay} = ${today}::date)`.mapWith(
            Number,
          ),
        planted:
          sql<number>`count(*) filter (where ${vocabActivity.kind} = 'learn-complete' and ${vnDay} = ${today}::date)`.mapWith(
            Number,
          ),
        reviewed:
          sql<number>`count(distinct ${vocabActivity.wordId}) filter (where ${vocabActivity.correct} and ${vocabActivity.kind} = 'session-step' and ${vnDay} = ${today}::date and not exists (
            select 1 from vocab_activity lc
            where lc.user_id = vocab_activity.user_id
              and lc.word_id = vocab_activity.word_id
              and lc.kind = 'learn-complete'
              and (lc.created_at at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date
          ))`.mapWith(Number),
      })
      .from(vocabActivity)
      .where(eq(vocabActivity.userId, userId));
    return {
      practiced: row?.practiced ?? 0,
      planted: row?.planted ?? 0,
      reviewed: row?.reviewed ?? 0,
    };
  } catch (error) {
    console.error("[today:vocabAggregates] query failed:", error);
    return { practiced: 0, planted: 0, reviewed: 0 };
  }
}

async function readQuestsToday(userId: string, today: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ questId: questCompletions.questId })
      .from(questCompletions)
      .where(
        and(
          eq(questCompletions.userId, userId),
          eq(questCompletions.date, today),
        ),
      );
    return rows.map((r) => r.questId);
  } catch (error) {
    console.error("[today:questsToday] query failed:", error);
    return [];
  }
}

async function readQuestCompletionCount(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(questCompletions)
      .where(eq(questCompletions.userId, userId));
    return row?.n ?? 0;
  } catch (error) {
    console.error("[today:questCount] query failed:", error);
    return 0;
  }
}

async function readOwnedBadges(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ badgeId: userBadges.badgeId })
      .from(userBadges)
      .where(eq(userBadges.userId, userId));
    return rows.map((r) => r.badgeId);
  } catch (error) {
    console.error("[today:badges] query failed:", error);
    return [];
  }
}

async function readFreezes(userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ date: streakFreezes.date })
      .from(streakFreezes)
      .where(eq(streakFreezes.userId, userId));
    return rows.map((r) => r.date);
  } catch (error) {
    console.error("[today:freezes] query failed:", error);
    return [];
  }
}

/**
 * Badge aggregates all-time (§2.5): COUNT 2 bảng + listenMinutes theo
 * getMyStats semantics — SUM duration DISTINCT parts đã luyện (KHÔNG phải
 * tổng daily_activity.listen_ms). 2 COUNT query riêng — KHÔNG load rows.
 */
async function readBadgeAggregates(
  userId: string,
): Promise<{ activeDays: number; wordsLearned: number; listenMinutes: number }> {
  try {
    const [activeDaysRow, wordsRow, listenRow] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(dailyActivity)
        .where(eq(dailyActivity.userId, userId)),
      db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(userWordProgress)
        .where(
          and(
            eq(userWordProgress.userId, userId),
            gte(userWordProgress.reps, 1),
          ),
        ),
      (() =>
        // DISTINCT part (một part attempt N lần góp 1 lần) — IN-subquery raw
        // trong CÙNG chain (subquery builder .as() là chain riêng không được
        // await → unhandled rejection trong mock fail-path tests)
        db
          .select({
            ms:
              sql<number>`coalesce(sum(${lessonParts.durationMs}), 0)::int`.mapWith(
                Number,
              ),
          })
          .from(lessonParts)
          .where(
            sql`${lessonParts.id} in (select distinct part_id from attempts where user_id = ${userId})`,
          ))(),
    ]);
    return {
      activeDays: activeDaysRow[0]?.n ?? 0,
      wordsLearned: wordsRow[0]?.n ?? 0,
      listenMinutes: (listenRow[0]?.ms ?? 0) / 60_000,
    };
  } catch (error) {
    console.error("[today:badgeAggregates] query failed:", error);
    return { activeDays: 0, wordsLearned: 0, listenMinutes: 0 };
  }
}

// ---------------------------------------------------------------------------
// Resolver §3.4 — bài dictation kế tiếp (cross-unit, SQL-side)
// ---------------------------------------------------------------------------

/**
 * Bài published ĐẦU TIÊN theo books.sort_order → units.sort_order →
 * lessons.number CHƯA done (not mọi part có attempt accuracy ≥ 1), ưu tiên
 * sách đang đọc (user_lesson_progress — pattern getContinueTarget); fallback
 * bài đầu toàn hệ. MỘT query aggregate per-lesson (count DISTINCT part +
 * count DISTINCT part-pass) — KHÔNG load-all parts hệ thống; pick-first ở
 * JS trên danh sách lesson-level (cỡ chục dòng). DB lỗi → null.
 */
export async function getNextDictationTarget(
  userId: string,
): Promise<DictationNextCard | null> {
  try {
    const reading = await db
      .selectDistinct({ bookId: units.bookId })
      .from(userLessonProgress)
      .innerJoin(lessons, eq(lessons.id, userLessonProgress.lessonId))
      .innerJoin(units, eq(units.id, lessons.unitId))
      .where(eq(userLessonProgress.userId, userId));
    const readingIds = new Set(reading.map((r) => r.bookId));

    const rows = await db
      .select({
        bookId: books.id,
        bookSlug: books.slug,
        unitNumber: units.number,
        lessonNumber: lessons.number,
        titleEn: lessons.titleEn,
        titleVi: lessons.titleVi,
        doneParts:
          sql<number>`count(distinct ${attempts.partId})`.mapWith(Number),
        totalParts:
          sql<number>`count(distinct ${lessonParts.id})`.mapWith(Number),
      })
      .from(lessons)
      .innerJoin(units, eq(units.id, lessons.unitId))
      .innerJoin(books, eq(books.id, units.bookId))
      .leftJoin(lessonParts, eq(lessonParts.lessonId, lessons.id))
      .leftJoin(
        attempts,
        and(
          eq(attempts.partId, lessonParts.id),
          eq(attempts.userId, userId),
          gte(attempts.accuracy, 1),
        ),
      )
      .where(eq(lessons.published, true))
      .groupBy(lessons.id, units.id, books.id)
      .orderBy(
        asc(books.sortOrder),
        asc(units.sortOrder),
        asc(lessons.number),
      );

    const undone = rows.filter(
      (r) => r.totalParts > 0 && r.doneParts < r.totalParts,
    );
    const pick = undone.find((r) => readingIds.has(r.bookId)) ?? undone[0];
    if (!pick) return null;
    return {
      bookSlug: pick.bookSlug,
      unitNumber: pick.unitNumber,
      lessonNumber: pick.lessonNumber,
      title: pick.titleEn,
      titleVi: pick.titleVi,
      doneParts: pick.doneParts,
      totalParts: pick.totalParts,
    };
  } catch (error) {
    console.error("[today:dictationNext] query failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Snapshot + write-tx
// ---------------------------------------------------------------------------

function resolveTarget(
  target: QuestTarget,
  goalMinutes: number,
  goalWords: number,
): number {
  if (target === "goalMinutes") return goalMinutes;
  if (target === "goalWords") return goalWords;
  return target;
}

function questProgress(
  metric: QuestMetric,
  s: {
    partsToday: number;
    listenMinutesToday: number;
    reviewedToday: number;
    plantedToday: number;
    practicedToday: number;
    dual: DualGoalStatus;
  },
): number {
  switch (metric) {
    case "partsToday":
      return s.partsToday;
    case "listenGoal":
      return s.listenMinutesToday;
    case "reviewedToday":
      return s.reviewedToday;
    case "plantedToday":
      return s.plantedToday;
    case "practicedGoal":
      return s.practicedToday;
    case "goalDual":
      return (s.dual.minutes.done ? 1 : 0) + (s.dual.words.done ? 1 : 0);
  }
}

const QUEST_DEF_BY_ID = new Map(QUEST_POOL.map((d) => [d.questId, d]));

/**
 * Snapshot /today (§3.2) — đọc fan-out + MỘT tx ghi nhỏ. KHÔNG route snapshot
 * (RSC-only — SF-3 page gọi trực tiếp). `now` inject để test/timezone-owned.
 */
export async function getTodaySnapshot(
  userId: string,
  now: Date,
): Promise<TodaySnapshot> {
  const today = vnToday(now);

  // (1) fan-out — THỨ TỰ pin trong today-store.test.ts (15 chain)
  const [
    profile,
    activity,
    vocab,
    hubStats,
    dictationNext,
    vocabContinue,
    questsToday,
    questsCompletedCount,
    ownedBadges,
    freezes,
    badgeAgg,
  ] = await Promise.all([
    readProfile(userId),
    readTodayActivity(userId),
    readVocabAggregates(userId, today),
    getHubStats(userId),
    getNextDictationTarget(userId),
    getContinueTarget(userId),
    readQuestsToday(userId, today),
    readQuestCompletionCount(userId),
    readOwnedBadges(userId),
    readFreezes(userId),
    readBadgeAggregates(userId),
  ]);

  const listenMinutesToday = Math.floor(activity.listenMs / 60_000);
  const goalMinutes = profile?.dailyGoalMinutes ?? DEFAULT_GOAL_MINUTES;
  const goalWords = profile?.dailyGoalWords ?? DEFAULT_GOAL_WORDS;

  const dual = dualGoalStatus({
    minutesToday: listenMinutesToday,
    goalMinutes,
    practicedToday: vocab.practiced,
    goalWords,
  });

  const questIds = selectQuests(userId, today);
  const quests: TodayQuest[] = questIds.map((questId) => {
    const def = QUEST_DEF_BY_ID.get(questId)!;
    const target = resolveTarget(def.target, goalMinutes, goalWords);
    const progress = questProgress(def.metric, {
      partsToday: activity.partsDone,
      listenMinutesToday,
      reviewedToday: vocab.reviewed,
      plantedToday: vocab.planted,
      practicedToday: vocab.practiced,
      dual,
    });
    return {
      questId,
      progress,
      target,
      done: progress >= target,
      recorded: questsToday.includes(questId),
    };
  });

  // (2) MỘT tx ghi nhỏ — monthly grant + quest auto-record + badge lazy-award.
  // Fail → snapshot vẫn trả (read đã có), log, không throw (spec §3.2).
  let newlyCompletedQuests: string[] = [];
  let newlyEarnedBadges: string[] = [];
  let shieldCredits = profile?.shieldCredits ?? 0;
  try {
    await db.transaction(async (tx) => {
      // Monthly grant (§2.3): INSERT ledger ON CONFLICT — CHỈ khi RETURNING
      // có row mới UPDATE credits (least +1, cap 2) — chống double-credit
      // khi 2 tab render đồng thời (ON CONFLICT không tự bảo vệ increment).
      const month = today.slice(0, 7); // 'YYYY-MM' VN
      const granted = await tx
        .insert(shieldGrants)
        .values({ userId, month })
        .onConflictDoNothing()
        .returning({ userId: shieldGrants.userId });
      if (granted.length > 0) {
        const [updated] = await tx
          .update(profiles)
          .set({
            shieldCredits: sql`least(${profiles.shieldCredits} + 1, ${SHIELD_CAP})`,
          })
          .where(eq(profiles.id, userId))
          .returning({ shieldCredits: profiles.shieldCredits });
        if (updated) shieldCredits = updated.shieldCredits;
      }

      // Quest auto-record (§2.4): predicate đạt + chưa có row → INSERT
      // RETURNING — ledger idempotent (reload/rerender không lặp).
      const todo = quests.filter((q) => q.done && !q.recorded);
      if (todo.length > 0) {
        const rows = await tx
          .insert(questCompletions)
          .values(
            todo.map((q) => ({ userId, date: today, questId: q.questId })),
          )
          .onConflictDoNothing()
          .returning({ questId: questCompletions.questId });
        newlyCompletedQuests = rows.map((r) => r.questId);
      }

      // Badge lazy-award (§2.5): evalBadges trên aggregates — quest count
      // gồm cả quest VỪA record trong tx này (quests-5 award cùng snapshot).
      const stats: BadgeStats = {
        streak: profile?.streakCount ?? 0,
        activeDays: badgeAgg.activeDays,
        wordsLearned: badgeAgg.wordsLearned,
        listenMinutes: badgeAgg.listenMinutes,
        questsCompleted: questsCompletedCount + newlyCompletedQuests.length,
      };
      const missing = evalBadges(stats).filter(
        (badgeId) => !ownedBadges.includes(badgeId),
      );
      if (missing.length > 0) {
        const rows = await tx
          .insert(userBadges)
          .values(missing.map((badgeId) => ({ userId, badgeId })))
          .onConflictDoNothing()
          .returning({ badgeId: userBadges.badgeId });
        newlyEarnedBadges = rows.map((r) => r.badgeId);
      }
    });
  } catch (error) {
    console.error("[today:snapshot] write-tx failed (snapshot vẫn trả):", error);
  }

  // recorded cập nhật theo ledger VỪA ghi — UI "auto-done" hiện đúng trạng thái
  const questsFinal = quests.map((q) => ({
    ...q,
    recorded: q.recorded || newlyCompletedQuests.includes(q.questId),
  }));

  return {
    date: today,
    listenMinutesToday,
    dailyGoalMinutes: goalMinutes,
    practicedToday: vocab.practiced,
    plantedToday: vocab.planted,
    dailyGoalWords: goalWords,
    partsToday: activity.partsDone,
    dueToday: hubStats.dueToday,
    reviewedToday: vocab.reviewed,
    streak: computeStreak(activity.dates, today, new Set(freezes)),
    activeToday: activity.dates.includes(today),
    goalDone: dual,
    dictationNext,
    vocabContinue,
    quests: questsFinal,
    newlyCompletedQuests,
    newlyEarnedBadges,
    badges: ownedBadges,
    shield: { credits: shieldCredits, cap: SHIELD_CAP, freezes },
  };
}

/**
 * Lưu mục tiêu phút nghe/ngày (§3.3) — route /api/today/goal gọi sau khi
 * validate integer 5..120 (route sở hữu taxonomy 401/400). { ok:false } khi
 * DB lỗi hoặc profile mất (route map 500 generic). Mirror updateDailyGoal.
 */
export async function updateDailyGoalMinutes(
  userId: string,
  minutes: number,
): Promise<{ ok: boolean; dailyGoalMinutes?: number }> {
  try {
    const [row] = await db
      .update(profiles)
      .set({ dailyGoalMinutes: minutes })
      .where(eq(profiles.id, userId))
      .returning({ dailyGoalMinutes: profiles.dailyGoalMinutes });
    if (!row) {
      console.error("[today:updateDailyGoalMinutes] profile missing:", userId);
      return { ok: false };
    }
    return { ok: true, dailyGoalMinutes: row.dailyGoalMinutes };
  } catch (error) {
    console.error("[today:updateDailyGoalMinutes] update failed:", error);
    return { ok: false };
  }
}

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  books,
  dailyActivity,
  leaderboard,
  lessonParts,
  lessons,
  profiles,
  units,
} from "@/db/schema";
import { addDays, vnToday } from "@/lib/gamification/streak";

/**
 * Read queries gamification SF-6 (context pack #5, #6) — server-only, dùng
 * trực tiếp trong RSC của /top-users + /me. Ghi đi qua actions/submit-attempt.
 */

export interface LeaderboardRow {
  displayName: string | null;
  avatarUrl: string | null;
  xp: number;
}

/** Leaderboard từ SQL view SF-2 — scope 'weekly' (ISO Mon–Sun TZ +07, từ
 *  attempts.xp) | 'all_time' (profiles.xp). Chỉ expose name/avatar/xp (§4). */
export async function getLeaderboard(
  scope: "weekly" | "all_time",
  limit = 50,
): Promise<LeaderboardRow[]> {
  return db
    .select({
      displayName: leaderboard.displayName,
      avatarUrl: leaderboard.avatarUrl,
      xp: leaderboard.xp,
    })
    .from(leaderboard)
    .where(eq(leaderboard.scope, scope))
    .orderBy(desc(leaderboard.xp))
    .limit(limit);
}

export interface MyStats {
  totalXp: number;
  streak: number;
  /** DISTINCT parts có attempt (đã luyện — làm lại không đếm kép). */
  partsPracticed: number;
  /** TB best-accuracy mỗi part (attempt sửa lỗi không kéo xuống). */
  averageAccuracy: number;
  /** Tổng phút nghe = sum duration DISTINCT parts đã nghe (context pack #6). */
  listenMinutes: number;
  /** daily_activity trong 84 ngày (heatmap 12 tuần). */
  activity: { date: string; partsDone: number }[];
}

export async function getMyStats(userId: string): Promise<MyStats> {
  const [profile] = await db
    .select({ xp: profiles.xp, streakCount: profiles.streakCount })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  // DISTINCT part → best accuracy + duration (join parts) — MỘT query,
  // tổng hợp JS (per-user scale nhỏ, đơn giản hơn SQL window)
  const heardParts = await db
    .select({
      best: sql<number>`max(${attempts.accuracy})`,
      durationMs: lessonParts.durationMs,
    })
    .from(attempts)
    .innerJoin(lessonParts, eq(lessonParts.id, attempts.partId))
    .where(eq(attempts.userId, userId))
    .groupBy(attempts.partId, lessonParts.durationMs);

  const partsPracticed = heardParts.length;
  const averageAccuracy =
    partsPracticed === 0
      ? 0
      : heardParts.reduce((sum, p) => sum + Number(p.best), 0) /
        partsPracticed;
  const listenMs = heardParts.reduce(
    (sum, p) => sum + (p.durationMs ?? 0),
    0,
  );

  const today = vnToday(new Date());
  const activity = await db
    .select({ date: dailyActivity.date, partsDone: dailyActivity.partsDone })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.date, addDays(today, -83)),
      ),
    )
    .orderBy(dailyActivity.date);

  return {
    totalXp: profile?.xp ?? 0,
    streak: profile?.streakCount ?? 0,
    partsPracticed,
    averageAccuracy,
    listenMinutes: listenMs / 60000,
    activity,
  };
}

export interface BookProgress {
  slug: string;
  titleEn: string;
  titleVi: string | null;
  color: string;
  totalLessons: number;
  doneLessons: number;
}

/**
 * Tiến độ từng book (% lessons done — context pack #6): lesson DONE ⟺ mọi
 * part có ≥1 attempt accuracy ≥ 1 (part skip = chưa có allCorrect ⟹ lesson
 * chưa done — "yêu cầu 0 skipped" thỏa ngầm định). Chỉ đếm lesson published.
 */
export async function getBookProgress(
  userId: string,
): Promise<BookProgress[]> {
  const bookRows = await db
    .select({
      id: books.id,
      slug: books.slug,
      titleEn: books.titleEn,
      titleVi: books.titleVi,
      color: books.color,
    })
    .from(books)
    .orderBy(books.sortOrder);

  const lessonStats = await db
    .select({
      bookId: units.bookId,
      total: sql<number>`count(distinct ${lessons.id})::int`,
      done: sql<number>`count(distinct case when not exists (
        select 1 from lesson_parts p
        where p.lesson_id = ${lessons.id}
          and not exists (
            select 1 from attempts a
            where a.part_id = p.id and a.user_id = ${userId} and a.accuracy >= 1
          )
      ) then ${lessons.id} end)::int`,
    })
    .from(lessons)
    .innerJoin(units, eq(units.id, lessons.unitId))
    .where(eq(lessons.published, true))
    .groupBy(units.bookId);

  const byBook = new Map(lessonStats.map((s) => [s.bookId, s]));
  return bookRows.map((b) => ({
    slug: b.slug,
    titleEn: b.titleEn,
    titleVi: b.titleVi,
    color: b.color,
    totalLessons: byBook.get(b.id)?.total ?? 0,
    doneLessons: byBook.get(b.id)?.done ?? 0,
  }));
}

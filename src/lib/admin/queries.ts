import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  books,
  lessonParts,
  lessons,
  profiles,
  units,
  users,
} from "@/db/schema";

/**
 * Admin queries (SF-5) — nguồn data cho /admin. KHÁCH với content/queries.ts:
 * đọc TRỰC TIẾP db, KHÔNG unstable_cache — admin phải luôn thấy fresh (cache
 * công khai chỉ stale qua revalidateContent() lúc write). Gồm cả draft.
 */

export type AdminBookRow = {
  id: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  cefrLabel: string;
  color: string;
  unitCount: number;
  lessonCount: number;
  publishedCount: number;
  partCount: number;
  partsMissingAudio: number;
};

export type AdminUnitRow = {
  id: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  descEn: string | null;
  descVi: string | null;
  lessonCount: number;
  publishedCount: number;
};

export type AdminLessonRow = {
  id: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  vocabLevel: string;
  published: boolean;
  partsCount: number;
  partsMissingAudio: number;
};

export type AdminPartRow = {
  id: number;
  sortOrder: number;
  text: string;
  audioPath: string | null;
  durationMs: number | null;
  attemptsCount: number;
};

export type AdminLessonDetail = {
  id: number;
  number: number;
  titleEn: string;
  titleVi: string | null;
  vocabLevel: string;
  published: boolean;
  unitId: number;
  unitNumber: number;
  bookSlug: string;
  bookTitleEn: string;
  bookTitleVi: string | null;
  parts: AdminPartRow[];
};

export type AdminUserRow = {
  id: string;
  displayName: string | null;
  email: string | null;
  role: string;
  createdAt: Date;
};

export async function getAdminBooks(): Promise<AdminBookRow[]> {
  const [bookRows, unitCounts, lessonCounts, partCounts] = await Promise.all([
    db.select().from(books).orderBy(asc(books.sortOrder)),
    db
      .select({ bookId: units.bookId, total: count() })
      .from(units)
      .groupBy(units.bookId),
    db
      .select({
        bookId: units.bookId,
        total: count(),
        published: sql<number>`count(*) filter (where ${lessons.published})`.mapWith(Number),
      })
      .from(lessons)
      .innerJoin(units, eq(lessons.unitId, units.id))
      .groupBy(units.bookId),
    db
      .select({
        bookId: units.bookId,
        total: count(),
        missing: sql<number>`count(*) filter (where ${lessonParts.audioPath} is null)`.mapWith(Number),
      })
      .from(lessonParts)
      .innerJoin(lessons, eq(lessonParts.lessonId, lessons.id))
      .innerJoin(units, eq(lessons.unitId, units.id))
      .groupBy(units.bookId),
  ]);
  const unitMap = new Map(unitCounts.map((r) => [r.bookId, r.total]));
  const lessonMap = new Map(lessonCounts.map((r) => [r.bookId, r]));
  const partMap = new Map(partCounts.map((r) => [r.bookId, r]));
  return bookRows.map((b) => ({
    id: b.id,
    slug: b.slug,
    titleEn: b.titleEn,
    titleVi: b.titleVi,
    cefrLabel: b.cefrLabel,
    color: b.color,
    unitCount: unitMap.get(b.id) ?? 0,
    lessonCount: lessonMap.get(b.id)?.total ?? 0,
    publishedCount: lessonMap.get(b.id)?.published ?? 0,
    partCount: partMap.get(b.id)?.total ?? 0,
    partsMissingAudio: partMap.get(b.id)?.missing ?? 0,
  }));
}

export async function getAdminBookBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(books)
    .where(eq(books.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getAdminUnit(bookId: number, number: number) {
  const [row] = await db
    .select()
    .from(units)
    .where(and(eq(units.bookId, bookId), eq(units.number, number)))
    .limit(1);
  return row ?? null;
}

async function lessonStatsByUnit(unitIds: number[]) {
  if (unitIds.length === 0) {
    return new Map<number, { total: number; published: number }>();
  }
  const rows = await db
    .select({
      unitId: lessons.unitId,
      total: count(),
      published: sql<number>`count(*) filter (where ${lessons.published})`.mapWith(Number),
    })
    .from(lessons)
    .where(inArray(lessons.unitId, unitIds))
    .groupBy(lessons.unitId);
  return new Map(rows.map((r) => [r.unitId, { total: r.total, published: r.published }]));
}

export async function getAdminUnits(bookId: number): Promise<AdminUnitRow[]> {
  const [unitRows, stats] = await Promise.all([
    db
      .select()
      .from(units)
      .where(eq(units.bookId, bookId))
      .orderBy(asc(units.number)),
    lessonStatsByUnit(
      (
        await db
          .select({ id: units.id })
          .from(units)
          .where(eq(units.bookId, bookId))
      ).map((r) => r.id),
    ),
  ]);
  return unitRows.map((u) => ({
    id: u.id,
    number: u.number,
    titleEn: u.titleEn,
    titleVi: u.titleVi,
    descEn: u.descEn,
    descVi: u.descVi,
    lessonCount: stats.get(u.id)?.total ?? 0,
    publishedCount: stats.get(u.id)?.published ?? 0,
  }));
}

async function partStatsByLesson(unitId: number) {
  const rows = await db
    .select({
      lessonId: lessons.id,
      total: count(),
      missing: sql<number>`count(*) filter (where ${lessonParts.audioPath} is null)`.mapWith(Number),
    })
    .from(lessonParts)
    .innerJoin(lessons, eq(lessonParts.lessonId, lessons.id))
    .where(eq(lessons.unitId, unitId))
    .groupBy(lessons.id);
  return new Map(rows.map((r) => [r.lessonId, { total: r.total, missing: r.missing }]));
}

export async function getAdminLessons(unitId: number): Promise<AdminLessonRow[]> {
  const [rows, stats] = await Promise.all([
    db
      .select()
      .from(lessons)
      .where(eq(lessons.unitId, unitId))
      .orderBy(asc(lessons.number)),
    partStatsByLesson(unitId),
  ]);
  return rows.map((l) => ({
    id: l.id,
    number: l.number,
    titleEn: l.titleEn,
    titleVi: l.titleVi,
    vocabLevel: l.vocabLevel,
    published: l.published,
    partsCount: stats.get(l.id)?.total ?? 0,
    partsMissingAudio: stats.get(l.id)?.missing ?? 0,
  }));
}

export async function getAdminLessonDetail(lessonId: number): Promise<AdminLessonDetail | null> {
  const [row] = await db
    .select({
      lesson: lessons,
      unitNumber: units.number,
      bookSlug: books.slug,
      bookTitleEn: books.titleEn,
      bookTitleVi: books.titleVi,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(books, eq(units.bookId, books.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!row) return null;
  const parts = await db
    .select()
    .from(lessonParts)
    .where(eq(lessonParts.lessonId, lessonId))
    .orderBy(asc(lessonParts.sortOrder));
  const attemptRows = parts.length
    ? await db
        .select({ partId: attempts.partId, total: count() })
        .from(attempts)
        .where(inArray(attempts.partId, parts.map((p) => p.id)))
        .groupBy(attempts.partId)
    : [];
  const attemptMap = new Map(attemptRows.map((r) => [r.partId, r.total]));
  return {
    id: row.lesson.id,
    number: row.lesson.number,
    titleEn: row.lesson.titleEn,
    titleVi: row.lesson.titleVi,
    vocabLevel: row.lesson.vocabLevel,
    published: row.lesson.published,
    unitId: row.lesson.unitId,
    unitNumber: row.unitNumber,
    bookSlug: row.bookSlug,
    bookTitleEn: row.bookTitleEn,
    bookTitleVi: row.bookTitleVi,
    parts: parts.map((p) => ({
      id: p.id,
      sortOrder: p.sortOrder,
      text: p.text,
      audioPath: p.audioPath,
      durationMs: p.durationMs,
      attemptsCount: attemptMap.get(p.id) ?? 0,
    })),
  };
}

export type RecentAttemptRow = {
  id: number;
  partText: string;
  displayName: string | null;
  accuracy: number;
  xp: number;
  createdAt: Date;
};

export type DashboardData = {
  totals: {
    lessons: number;
    publishedLessons: number;
    parts: number;
    partsMissingAudio: number;
    users: number;
    newUsers7d: number;
  };
  perBook: AdminBookRow[];
  recentAttempts: RecentAttemptRow[];
  newUsers: AdminUserRow[];
};

export async function getAdminDashboard(): Promise<DashboardData> {
  const [perBook, totalsRow, userTotalsRow, recentAttempts, newUsers] =
    await Promise.all([
      getAdminBooks(),
      db
        .select({
          lessons: count(),
          published: sql<number>`count(*) filter (where ${lessons.published})`.mapWith(Number),
        })
        .from(lessons),
      db
        .select({
          users: count(),
          new7d: sql<number>`count(*) filter (where ${profiles.createdAt} > now() - interval '7 days')`.mapWith(Number),
        })
        .from(profiles),
      db
        .select({
          id: attempts.id,
          partText: lessonParts.text,
          displayName: profiles.displayName,
          accuracy: attempts.accuracy,
          xp: attempts.xp,
          createdAt: attempts.createdAt,
        })
        .from(attempts)
        .innerJoin(lessonParts, eq(attempts.partId, lessonParts.id))
        .innerJoin(profiles, eq(attempts.userId, profiles.id))
        .orderBy(desc(attempts.createdAt))
        .limit(8),
      db
        .select({
          id: profiles.id,
          displayName: profiles.displayName,
          email: users.email,
          role: profiles.role,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .innerJoin(users, eq(profiles.id, users.id))
        .orderBy(desc(profiles.createdAt))
        .limit(5),
    ]);
  // parts totals gộp từ perBook (đã group theo book — không query thêm)
  const totals = {
    lessons: totalsRow[0]?.lessons ?? 0,
    publishedLessons: totalsRow[0]?.published ?? 0,
    parts: perBook.reduce((s, b) => s + b.partCount, 0),
    partsMissingAudio: perBook.reduce((s, b) => s + b.partsMissingAudio, 0),
    users: userTotalsRow[0]?.users ?? 0,
    newUsers7d: userTotalsRow[0]?.new7d ?? 0,
  };
  return { totals, perBook, recentAttempts, newUsers };
}

export async function searchAdminUsers(q: string): Promise<AdminUserRow[]> {
  const term = `%${q.trim()}%`;
  return db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: users.email,
      role: profiles.role,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.id, users.id))
    .where(
      q.trim()
        ? or(ilike(profiles.displayName, term), ilike(users.email, term))
        : undefined,
    )
    .orderBy(desc(profiles.createdAt))
    .limit(20);
}

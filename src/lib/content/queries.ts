import { unstable_cache } from "next/cache";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, lessonParts, lessons, units, words } from "@/db/schema";
import { localize } from "./localize";
import { CONTENT_TAG } from "@/lib/revalidate";

/**
 * content-queries-lib (context pack SF-2 #5) — nguồn data DUY NHẤT cho các
 * trang public. Mọi cột content đi qua fallback chain vi→en→raw (spec §8)
 * qua localize() ở layer này — pages không tự xử lý fallback.
 *
 * - Cache: unstable_cache tag `content`, revalidate 300 — SF-5 publish gọi
 *   revalidateContent() (lib/revalidate.ts) là stale toàn bộ.
 * - Build-safe: CI/Vercel build KHÔNG có DATABASE_URL → catch trả fallback
 *   (rỗng/null), KHÔNG cache lỗi; request thật đầu tiên heal qua ISR.
 * - Published-only: trang public chỉ thấy lesson published (draft là SF-5).
 */

const CACHE_OPTS: { tags: string[]; revalidate: number } = {
  tags: [CONTENT_TAG],
  revalidate: 300,
};

async function cachedQuery<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  const run = unstable_cache(fn, [key], CACHE_OPTS);
  try {
    return await run();
  } catch (error) {
    console.error(`[content] query ${key} failed:`, error);
    return fallback;
  }
}

function toInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

export type LocalizedBook = {
  id: number;
  slug: string;
  title: string;
  description: string;
  cefrLabel: string;
  examTarget: string | null;
  color: string;
  unitCount: number;
  lessonCount: number;
};

export type LocalizedUnit = {
  id: number;
  number: number;
  title: string;
  description: string;
  lessonCount: number;
};

export type LocalizedLessonSummary = {
  id: number;
  number: number;
  title: string;
  kind: string;
  vocabLevel: string;
  partsCount: number;
};

export type LessonPart = {
  id: number;
  sortOrder: number;
  text: string;
  audioPath: string | null;
  durationMs: number | null;
};

export type LocalizedLesson = {
  id: number;
  number: number;
  title: string;
  kind: string;
  vocabLevel: string;
  parts: LessonPart[];
  bookSlug: string;
  unitNumber: number;
};

async function lessonCountsByBook(): Promise<Map<number, number>> {
  const rows = await db
    .select({ bookId: units.bookId, total: count() })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .where(eq(lessons.published, true))
    .groupBy(units.bookId);
  return new Map(rows.map((r) => [r.bookId, r.total]));
}

async function lessonCountsByUnit(unitIds: number[]): Promise<Map<number, number>> {
  if (unitIds.length === 0) return new Map();
  const rows = await db
    .select({ unitId: lessons.unitId, total: count() })
    .from(lessons)
    .where(and(eq(lessons.published, true), inArray(lessons.unitId, unitIds)))
    .groupBy(lessons.unitId);
  return new Map(rows.map((r) => [r.unitId, r.total]));
}

export async function getBooks(locale: string): Promise<LocalizedBook[]> {
  return cachedQuery(
    `books:${locale}`,
    async () => {
      const [rows, unitCounts, lessonCounts] = await Promise.all([
        db.select().from(books).orderBy(asc(books.sortOrder)),
        db
          .select({ bookId: units.bookId, total: count() })
          .from(units)
          .groupBy(units.bookId),
        lessonCountsByBook(),
      ]);
      const unitMap = new Map(unitCounts.map((r) => [r.bookId, r.total]));
      return rows.map((b) => ({
        id: b.id,
        slug: b.slug,
        title: localize(locale, { en: b.titleEn, vi: b.titleVi }),
        description: localize(locale, { en: b.descEn, vi: b.descVi }),
        cefrLabel: b.cefrLabel,
        examTarget: b.examTarget,
        color: b.color,
        unitCount: unitMap.get(b.id) ?? 0,
        lessonCount: lessonCounts.get(b.id) ?? 0,
      }));
    },
    [],
  );
}

export async function getBook(
  slug: string,
  locale: string,
): Promise<LocalizedBook | null> {
  return cachedQuery(
    `book:${slug}:${locale}`,
    async () => {
      const [row] = await db
        .select()
        .from(books)
        .where(eq(books.slug, slug))
        .limit(1);
      if (!row) return null;
      const [unitCountRow] = await db
        .select({ total: count() })
        .from(units)
        .where(eq(units.bookId, row.id));
      const lessonCounts = await lessonCountsByBook();
      return {
        id: row.id,
        slug: row.slug,
        title: localize(locale, { en: row.titleEn, vi: row.titleVi }),
        description: localize(locale, { en: row.descEn, vi: row.descVi }),
        cefrLabel: row.cefrLabel,
        examTarget: row.examTarget,
        color: row.color,
        unitCount: unitCountRow?.total ?? 0,
        lessonCount: lessonCounts.get(row.id) ?? 0,
      };
    },
    null,
  );
}

export async function getUnits(
  bookSlug: string,
  locale: string,
): Promise<LocalizedUnit[]> {
  return cachedQuery(
    `units:${bookSlug}:${locale}`,
    async () => {
      const [book] = await db
        .select({ id: books.id })
        .from(books)
        .where(eq(books.slug, bookSlug))
        .limit(1);
      if (!book) return [];
      const rows = await db
        .select()
        .from(units)
        .where(eq(units.bookId, book.id))
        .orderBy(asc(units.number));
      const lessonCounts = await lessonCountsByUnit(
        rows.map((u) => u.id),
      );
      return rows.map((u) => ({
        id: u.id,
        number: u.number,
        title: localize(locale, { en: u.titleEn, vi: u.titleVi }, `Unit ${u.number}`),
        description: localize(locale, { en: u.descEn, vi: u.descVi }),
        lessonCount: lessonCounts.get(u.id) ?? 0,
      }));
    },
    [],
  );
}

export async function getUnit(
  bookSlug: string,
  unitNumber: string,
  locale: string,
): Promise<LocalizedUnit | null> {
  const num = toInt(unitNumber);
  if (num === null) return null;
  return cachedQuery(
    `unit:${bookSlug}:${num}:${locale}`,
    async () => {
      const [row] = await db
        .select({
          id: units.id,
          number: units.number,
          titleEn: units.titleEn,
          titleVi: units.titleVi,
          descEn: units.descEn,
          descVi: units.descVi,
        })
        .from(units)
        .innerJoin(books, eq(units.bookId, books.id))
        .where(and(eq(books.slug, bookSlug), eq(units.number, num)))
        .limit(1);
      if (!row) return null;
      const lessonCounts = await lessonCountsByUnit([row.id]);
      return {
        id: row.id,
        number: row.number,
        title: localize(locale, { en: row.titleEn, vi: row.titleVi }, `Unit ${row.number}`),
        description: localize(locale, { en: row.descEn, vi: row.descVi }),
        lessonCount: lessonCounts.get(row.id) ?? 0,
      };
    },
    null,
  );
}

export async function getLessons(
  bookSlug: string,
  unitNumber: string,
  locale: string,
): Promise<LocalizedLessonSummary[]> {
  const num = toInt(unitNumber);
  if (num === null) return [];
  return cachedQuery(
    `lessons:${bookSlug}:${num}:${locale}`,
    async () => {
      const [unit] = await db
        .select({ id: units.id })
        .from(units)
        .innerJoin(books, eq(units.bookId, books.id))
        .where(and(eq(books.slug, bookSlug), eq(units.number, num)))
        .limit(1);
      if (!unit) return [];
      const rows = await db
        .select()
        .from(lessons)
        .where(and(eq(lessons.unitId, unit.id), eq(lessons.published, true)))
        .orderBy(asc(lessons.number));
      const partsCounts = await db
        .select({ lessonId: lessonParts.lessonId, total: count() })
        .from(lessonParts)
        .groupBy(lessonParts.lessonId);
      const partsMap = new Map(partsCounts.map((r) => [r.lessonId, r.total]));
      return rows.map((l) => ({
        id: l.id,
        number: l.number,
        title: localize(locale, { en: l.titleEn, vi: l.titleVi }, `Lesson ${l.number}`),
        kind: l.kind,
        vocabLevel: l.vocabLevel,
        partsCount: partsMap.get(l.id) ?? 0,
      }));
    },
    [],
  );
}

export async function getLesson(
  bookSlug: string,
  unitNumber: string,
  lessonNumber: string,
  locale: string,
): Promise<LocalizedLesson | null> {
  const unitNum = toInt(unitNumber);
  const lessonNum = toInt(lessonNumber);
  if (unitNum === null || lessonNum === null) return null;
  return cachedQuery(
    `lesson:${bookSlug}:${unitNum}:${lessonNum}:${locale}`,
    async () => {
      const [row] = await db
        .select({
          lessonId: lessons.id,
          lessonNumber: lessons.number,
          titleEn: lessons.titleEn,
          titleVi: lessons.titleVi,
          kind: lessons.kind,
          vocabLevel: lessons.vocabLevel,
          bookSlug: books.slug,
          unitNumber: units.number,
        })
        .from(lessons)
        .innerJoin(units, eq(lessons.unitId, units.id))
        .innerJoin(books, eq(units.bookId, books.id))
        .where(
          and(
            eq(books.slug, bookSlug),
            eq(units.number, unitNum),
            eq(lessons.number, lessonNum),
            eq(lessons.published, true),
          ),
        )
        .limit(1);
      if (!row) return null;
      const parts = await db
        .select({
          id: lessonParts.id,
          sortOrder: lessonParts.sortOrder,
          text: lessonParts.text,
          audioPath: lessonParts.audioPath,
          durationMs: lessonParts.durationMs,
        })
        .from(lessonParts)
        .where(eq(lessonParts.lessonId, row.lessonId))
        .orderBy(asc(lessonParts.sortOrder));
      return {
        id: row.lessonId,
        number: row.lessonNumber,
        title: localize(locale, { en: row.titleEn, vi: row.titleVi }, `Lesson ${row.lessonNumber}`),
        kind: row.kind,
        vocabLevel: row.vocabLevel,
        parts,
        bookSlug: row.bookSlug,
        unitNumber: row.unitNumber,
      };
    },
    null,
  );
}

export type BookVocabWord = {
  id: number;
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
};

/**
 * Từ vựng của 1 book theo thứ tự học (book_words.order) — vocabulary module
 * SF-2 t-2.1. words là content không bản địa hóa (word EN + nghĩa VI cố định)
 * nên không qua localize; nút phát ẩn khi audioUrl null (t-2.2).
 */
export async function getBookVocabulary(
  bookSlug: string,
): Promise<BookVocabWord[]> {
  return cachedQuery(
    `vocabulary:${bookSlug}`,
    async () => {
      const rows = await db
        .select({
          id: words.id,
          word: words.word,
          ipa: words.ipa,
          meaningVi: words.meaningVi,
          example: words.example,
          audioUrl: words.audioUrl,
        })
        .from(bookWords)
        .innerJoin(words, eq(bookWords.wordId, words.id))
        .innerJoin(books, eq(bookWords.bookId, books.id))
        .where(eq(books.slug, bookSlug))
        .orderBy(asc(bookWords.order));
      return rows;
    },
    [],
  );
}

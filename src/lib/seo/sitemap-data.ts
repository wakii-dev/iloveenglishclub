import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { books, lessons, units } from "@/db/schema";
import { CONTENT_TAG } from "@/lib/revalidate";

/**
 * Nguồn data cho sitemap (SF-7 spec §4.4) — lib/content/queries là READ-ONLY
 * (boundary SF-2) nên sitemap tự đọc qua cùng pattern: unstable_cache tag
 * CONTENT_TAG + build-safe catch → [] (CI/Vercel build không DATABASE_URL).
 *
 * Chỉ PUBLISHED lessons; unit/book paths DERIVE từ chính tập rows đã lọc —
 * unit/book không còn published lesson nào tự động biến mất khỏi sitemap.
 * lastModified: omit — lessons không có updated_at (spec §4.4).
 */

export type PublishedLessonRow = {
  bookSlug: string;
  unitNumber: number;
  lessonNumber: number;
};

export function bookPath(bookSlug: string): string {
  return `/books/${bookSlug}`;
}

export function unitPath(bookSlug: string, unitNumber: number): string {
  return `/books/${bookSlug}/units/${unitNumber}`;
}

export function lessonPath(
  bookSlug: string,
  unitNumber: number,
  lessonNumber: number,
): string {
  return `/books/${bookSlug}/units/${unitNumber}/lessons/${lessonNumber}/listen-and-type`;
}

async function queryPublishedLessonRows(): Promise<PublishedLessonRow[]> {
  const rows = await db
    .select({
      bookSlug: books.slug,
      unitNumber: units.number,
      lessonNumber: lessons.number,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(books, eq(units.bookId, books.id))
    .where(eq(lessons.published, true));
  return rows;
}

const cachedPublishedLessonRows = unstable_cache(queryPublishedLessonRows, ["sitemap:published-lessons"], {
  tags: [CONTENT_TAG],
  revalidate: 300,
});

export async function getPublishedLessonRows(): Promise<PublishedLessonRow[]> {
  try {
    return await cachedPublishedLessonRows();
  } catch (error) {
    console.error("[seo] sitemap query failed:", error);
    return [];
  }
}

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { books, lessonParts, lessons, units } from "@/db/schema";
import type { DictationNextCard } from "./today-store";

/**
 * Chú thích "phút ước tính từ audio" cho hero /today (daily-journey SF-3,
 * VU-51 — spec §2.2 "Part không có duration góp 0 — hero hiển thị chú thích
 * khi bài hiện tại thiếu duration"). ⚠ REQUIREMENT-GAP epic VU-48: shape
 * DictationNextCard (pinned §3.2, SF-2 merge) không có duration-nullability
 * → SF-3 đọc phụ 1 query nhỏ ngoài store (store READ-LOCKED theo context
 * pack; nếu sau này store mở rộng `missingDuration` thì xoá file này).
 * Fallback-safe: DB lỗi → false (ẩn chú thích — không đổ page).
 */
export async function hasMissingDuration(
  suggestion: DictationNextCard,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({
        missing:
          sql<number>`count(*) filter (where ${lessonParts.durationMs} is null)`.mapWith(
            Number,
          ),
      })
      .from(lessonParts)
      .innerJoin(lessons, eq(lessons.id, lessonParts.lessonId))
      .innerJoin(units, eq(units.id, lessons.unitId))
      .innerJoin(books, eq(books.id, units.bookId))
      .where(
        and(
          eq(books.slug, suggestion.bookSlug),
          eq(units.number, suggestion.unitNumber),
          eq(lessons.number, suggestion.lessonNumber),
        ),
      );
    return (row?.missing ?? 0) > 0;
  } catch (error) {
    console.error("[today:durationHint] query failed:", error);
    return false;
  }
}

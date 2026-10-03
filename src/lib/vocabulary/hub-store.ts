/**
 * Hub aggregate store (SF-1 t-1.2) — tab Tổng quan của /[locale]/vocabulary:
 * KPI toàn bộ từ đang học (user_word_progress, mọi book) + danh sách từ
 * ⋈ words có filter book/trạng thái. Khác getBookVocabulary (unstable_cache
 * `content` — data dùng chung), hub là data CÁ NHÂN → query live, không cache.
 * DB lỗi (bảng chưa migrate) → fallback rỗng/0 — build-safe như listDueWords.
 * Phần pure (filter/status/MASTERED_REPS) sống ở hub-status.ts (client-safe).
 */
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, userWordProgress, words } from "@/db/schema";
import { MASTERED_REPS, type HubStatusFilter } from "./hub-status";

export const HUB_LIST_LIMIT = 100;

export type HubStats = { total: number; dueToday: number; mastered: number };

export type HubBook = {
  id: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
};

export type HubWordRow = {
  wordId: number;
  word: string;
  meaningVi: string;
  reps: number;
  dueAt: Date;
  books: { slug: string; titleEn: string; titleVi: string | null }[];
};

/** KPI toàn bộ từ đang học của user (mọi book — không theo filter bảng). */
export async function getHubStats(userId: string): Promise<HubStats> {
  try {
    const [row] = await db
      .select({
        total: sql<number>`count(*)`.mapWith(Number),
        dueToday:
          sql<number>`count(*) filter (where ${userWordProgress.dueAt} <= now())`.mapWith(
            Number,
          ),
        mastered:
          sql<number>`count(*) filter (where ${userWordProgress.reps} >= ${MASTERED_REPS})`.mapWith(
            Number,
          ),
      })
      .from(userWordProgress)
      .where(eq(userWordProgress.userId, userId));
    return row ?? { total: 0, dueToday: 0, mastered: 0 };
  } catch (error) {
    console.error("[vocabulary:hubStats] query failed:", error);
    return { total: 0, dueToday: 0, mastered: 0 };
  }
}

/**
 * Danh sách từ đang học + filter. Book lọc qua subquery book_words (1 từ có
 * thể thuộc nhiều book); title book gom ở query thứ 2 (wordId → books theo
 * sortOrder) — tránh group trong SQL, shape phẳng dễ test.
 */
export async function listHubWords(
  userId: string,
  filter: { bookId: number | null; status: HubStatusFilter },
): Promise<HubWordRow[]> {
  try {
    const conditions = [eq(userWordProgress.userId, userId)];
    if (filter.status === "due") {
      conditions.push(lte(userWordProgress.dueAt, sql`now()`));
    } else if (filter.status === "mastered") {
      conditions.push(gte(userWordProgress.reps, MASTERED_REPS));
    } else if (filter.status === "learning") {
      conditions.push(lt(userWordProgress.reps, MASTERED_REPS));
    }
    if (filter.bookId !== null) {
      conditions.push(
        inArray(
          words.id,
          db
            .select({ id: bookWords.wordId })
            .from(bookWords)
            .where(eq(bookWords.bookId, filter.bookId)),
        ),
      );
    }
    const rows = await db
      .select({
        wordId: words.id,
        word: words.word,
        meaningVi: words.meaningVi,
        reps: userWordProgress.reps,
        dueAt: userWordProgress.dueAt,
      })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(and(...conditions))
      .orderBy(asc(userWordProgress.dueAt), asc(words.word))
      .limit(HUB_LIST_LIMIT);
    if (rows.length === 0) return [];

    const assignments = await db
      .select({
        wordId: bookWords.wordId,
        slug: books.slug,
        titleEn: books.titleEn,
        titleVi: books.titleVi,
        sortOrder: books.sortOrder,
      })
      .from(bookWords)
      .innerJoin(books, eq(bookWords.bookId, books.id))
      .where(inArray(bookWords.wordId, rows.map((r) => r.wordId)))
      .orderBy(asc(books.sortOrder));

    const booksByWord = new Map<number, HubWordRow["books"]>();
    for (const a of assignments) {
      const list = booksByWord.get(a.wordId) ?? [];
      list.push({ slug: a.slug, titleEn: a.titleEn, titleVi: a.titleVi });
      booksByWord.set(a.wordId, list);
    }
    return rows.map((r) => ({ ...r, books: booksByWord.get(r.wordId) ?? [] }));
  } catch (error) {
    console.error("[vocabulary:listHubWords] query failed:", error);
    return [];
  }
}

/** Book có ≥1 từ (dropdown filter) — selectDistinct gom book nhiều từ. */
export async function listHubBooks(): Promise<HubBook[]> {
  try {
    const rows = await db
      .selectDistinct({
        id: books.id,
        slug: books.slug,
        titleEn: books.titleEn,
        titleVi: books.titleVi,
        sortOrder: books.sortOrder,
      })
      .from(books)
      .innerJoin(bookWords, eq(bookWords.bookId, books.id))
      .orderBy(asc(books.sortOrder));
    return rows.map(({ id, slug, titleEn, titleVi }) => ({
      id,
      slug,
      titleEn,
      titleVi,
    }));
  } catch (error) {
    console.error("[vocabulary:listHubBooks] query failed:", error);
    return [];
  }
}

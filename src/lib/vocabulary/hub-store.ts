/**
 * Hub aggregate store (SF-1 t-1.2) — tab Tổng quan của /[locale]/vocabulary:
 * KPI toàn bộ từ đang học (user_word_progress, mọi book) + danh sách từ
 * ⋈ words có filter book/trạng thái. Khác getBookVocabulary (unstable_cache
 * `content` — data dùng chung), hub là data CÁ NHÂN → query live, không cache.
 * DB lỗi (bảng chưa migrate) → fallback rỗng/0 — build-safe như listDueWords.
 * Phần pure (filter/status/MASTERED_REPS) sống ở hub-status.ts (client-safe).
 */
import {
  and,
  asc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  bookWords,
  books,
  lessons,
  units,
  userLessonProgress,
  userWordProgress,
  words,
} from "@/db/schema";
import {
  MASTERED_REPS,
  type HubStatusFilter,
  type LibraryFilters,
  escapeLikeTerm,
} from "./hub-status";
import type { DueWord } from "./review-store";

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

export const LIBRARY_PAGE_SIZE = 50;

export type LibraryWordRow = {
  wordId: number;
  word: string;
  meaningVi: string;
  audioUrl: string | null;
  books: { slug: string; titleEn: string; titleVi: string | null }[];
  /** null = chưa học (hoặc guest — không có trạng thái SRS). */
  progress: { reps: number; dueAt: Date } | null;
};

export type LibraryPage = {
  rows: LibraryWordRow[];
  total: number;
  page: number;
  totalPages: number;
};

/**
 * Tab Thư viện (SF-2 t-2.1): TOÀN BỘ bảng words (gồm từ độc lập ngoài
 * book_words), search ilike word/meaning_vi, filter book/has-audio + status
 * SRS (chỉ khi userId — guest duyệt không trạng thái), phân trang 50/trang.
 * Count query riêng để trang vượt cuối vẫn giữ total cho phân trang; left-
 * join user_word_progress khoá theo user (PK user+word → không nhân dòng);
 * status filter dùng cùng semantics listHubWords. DB lỗi → trang rỗng
 * (build-safe như listHubWords).
 */
export async function listLibraryWords(
  userId: string | null,
  filter: LibraryFilters,
): Promise<LibraryPage> {
  try {
    const conditions = [];
    if (filter.search !== "") {
      const like = `%${escapeLikeTerm(filter.search)}%`;
      conditions.push(
        or(ilike(words.word, like), ilike(words.meaningVi, like)),
      );
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
    if (filter.hasAudio) {
      conditions.push(isNotNull(words.audioUrl));
    }
    const status: HubStatusFilter = userId === null ? "all" : filter.status;
    if (status === "due") {
      conditions.push(lte(userWordProgress.dueAt, sql`now()`));
    } else if (status === "mastered") {
      conditions.push(gte(userWordProgress.reps, MASTERED_REPS));
    } else if (status === "learning") {
      conditions.push(lt(userWordProgress.reps, MASTERED_REPS));
    }
    const where = and(...conditions);
    // guest: điều kiện join false → mọi cột progress null (duyệt thuần library)
    const progressOn = userId
      ? and(
          eq(userWordProgress.wordId, words.id),
          eq(userWordProgress.userId, userId),
        )
      : sql`false`;

    const [countRow] = await db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(words)
      .leftJoin(userWordProgress, progressOn)
      .where(where);
    const total = countRow?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));

    const rows = await db
      .select({
        wordId: words.id,
        word: words.word,
        meaningVi: words.meaningVi,
        audioUrl: words.audioUrl,
        reps: userWordProgress.reps,
        dueAt: userWordProgress.dueAt,
      })
      .from(words)
      .leftJoin(userWordProgress, progressOn)
      .where(where)
      .orderBy(asc(words.word))
      .limit(LIBRARY_PAGE_SIZE)
      .offset((filter.page - 1) * LIBRARY_PAGE_SIZE);
    if (rows.length === 0) {
      return { rows: [], total, page: filter.page, totalPages };
    }

    // book của từng từ — query 2 như listHubWords (sortOrder book)
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

    const booksByWord = new Map<number, LibraryWordRow["books"]>();
    for (const a of assignments) {
      const list = booksByWord.get(a.wordId) ?? [];
      list.push({ slug: a.slug, titleEn: a.titleEn, titleVi: a.titleVi });
      booksByWord.set(a.wordId, list);
    }
    return {
      rows: rows.map((r) => ({
        wordId: r.wordId,
        word: r.word,
        meaningVi: r.meaningVi,
        audioUrl: r.audioUrl,
        progress:
          r.dueAt === null || r.reps === null
            ? null
            : { reps: r.reps, dueAt: r.dueAt },
        books: booksByWord.get(r.wordId) ?? [],
      })),
      total,
      page: filter.page,
      totalPages,
    };
  } catch (error) {
    console.error("[vocabulary:listLibraryWords] query failed:", error);
    return { rows: [], total: 0, page: filter.page, totalPages: 1 };
  }
}

export const DISCOVER_BOOK_LIMIT = 7;

export type DiscoverBook = {
  id: number;
  slug: string;
  titleEn: string;
  titleVi: string | null;
  unlearned: number;
};

/**
 * Sách "bạn đọc" còn từ chưa học (story vocabulary-learn t-1.3) — hàng Khám
 * phá tab Tổng quan. "Đang đọc" = book có user_lesson_progress (qua lessons ⋈
 * units); người mới chưa có tiến độ học bài → fallback MỌI book có từ (vẫn
 * đúng tinh thần khám phá). unlearned = từ của book chưa có row
 * user_word_progress của user (leftJoin đúng cặp user+word — không nhân dòng
 * vì PK); book đã học hết bị having loại. DB lỗi → [] build-safe (cùng
 * fallback listHubWords).
 */
export async function listDiscoverBooks(
  userId: string,
): Promise<DiscoverBook[]> {
  try {
    const reading = await db
      .selectDistinct({ bookId: units.bookId })
      .from(userLessonProgress)
      .innerJoin(lessons, eq(lessons.id, userLessonProgress.lessonId))
      .innerJoin(units, eq(units.id, lessons.unitId))
      .where(eq(userLessonProgress.userId, userId));
    const bookIds = reading.map((row) => row.bookId);

    const rows = await db
      .select({
        id: books.id,
        slug: books.slug,
        titleEn: books.titleEn,
        titleVi: books.titleVi,
        unlearned:
          sql<number>`count(*) filter (where ${userWordProgress.wordId} is null)`.mapWith(
            Number,
          ),
      })
      .from(books)
      .innerJoin(bookWords, eq(bookWords.bookId, books.id))
      .leftJoin(
        userWordProgress,
        and(
          eq(userWordProgress.wordId, bookWords.wordId),
          eq(userWordProgress.userId, userId),
        ),
      )
      .where(bookIds.length > 0 ? inArray(books.id, bookIds) : undefined)
      .groupBy(books.id)
      .having(sql`count(*) filter (where ${userWordProgress.wordId} is null) > 0`)
      .orderBy(asc(books.sortOrder))
      .limit(DISCOVER_BOOK_LIMIT);
    return rows;
  } catch (error) {
    console.error("[vocabulary:listDiscoverBooks] query failed:", error);
    return [];
  }
}

/**
 * 1 từ cho nút "Học từ này" (SF-2 t-2.2) — shape DueWord để Prefill thẻ
 * flashcard /me/vocabulary; SRS mặc định (engine applyReview upsert sẵn).
 * Không có/không thấy (id lạ) → null — UI bỏ qua prefill.
 */
export async function getStudyWord(wordId: number): Promise<DueWord | null> {
  try {
    const [row] = await db
      .select({
        wordId: words.id,
        word: words.word,
        ipa: words.ipa,
        meaningVi: words.meaningVi,
        example: words.example,
        audioUrl: words.audioUrl,
      })
      .from(words)
      .where(eq(words.id, wordId))
      .limit(1);
    return row ? { ...row, ease: 2.5, intervalDays: 0, reps: 0 } : null;
  } catch (error) {
    console.error("[vocabulary:getStudyWord] query failed:", error);
    return null;
  }
}

/**
 * Quiz DB leg (SF-4 t-4.1; mở rộng scope hub SF-3 t-3.2) — route
 * /api/vocabulary/quiz + trang quiz + tab Quiz hub gọi. Engine
 * buildQuiz/gradeQuiz PURE đã test ở quiz.test.ts; layer này chỉ lo DB
 * (pattern review-store.ts). Bảng chưa migrate → query trả [] (build-safe,
 * cùng fallback getBookVocabulary SF-2).
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, profiles, quizAttempts, words } from "@/db/schema";
import {
  buildQuiz,
  gradeQuiz,
  type QuizAnswer,
  type QuizQuestion,
  type QuizMode,
  type QuizScope,
  type QuizWord,
} from "./quiz";

/** Số dòng hiển thị trên bảng "Điểm quiz" của /top-users. */
export const QUIZ_LEADERBOARD_LIMIT = 10;

/** Word pool của 1 book (thứ tự học). Bảng thiếu → [] + log, không throw. */
export async function getBookQuizPool(bookId: number): Promise<QuizWord[]> {
  try {
    return await db
      .select({
        wordId: words.id,
        word: words.word,
        meaningVi: words.meaningVi,
        ipa: words.ipa,
      })
      .from(bookWords)
      .innerJoin(words, eq(words.id, bookWords.wordId))
      .innerJoin(books, eq(books.id, bookWords.bookId))
      .where(eq(books.id, bookId))
      .orderBy(asc(bookWords.order));
  } catch (error) {
    console.error("[vocabulary:getBookQuizPool] query failed:", error);
    return [];
  }
}

/**
 * Pool scope=all (SF-3 t-3.2): TOÀN BỘ bảng words — gộm cả từ độc lập ngoài
 * book_words. Bảng thiếu → [] + log, không throw.
 */
export async function getAllQuizPool(): Promise<QuizWord[]> {
  try {
    return await db
      .select({
        wordId: words.id,
        word: words.word,
        meaningVi: words.meaningVi,
        ipa: words.ipa,
      })
      .from(words)
      .orderBy(asc(words.id));
  } catch (error) {
    console.error("[vocabulary:getAllQuizPool] query failed:", error);
    return [];
  }
}

/**
 * Pool scope=multi (SF-3 t-3.2): hợp words của nhiều book — 1 từ nằm trong
 * nhiều book chỉ vào đề 1 lần (dedupe JS theo wordId, giữ bản đầu theo thứ
 * tự book rồi order trong book). Bảng thiếu → [] + log, không throw.
 */
export async function getMultiBookQuizPool(
  bookIds: readonly number[],
): Promise<QuizWord[]> {
  try {
    const rows = await db
      .select({
        wordId: words.id,
        word: words.word,
        meaningVi: words.meaningVi,
        ipa: words.ipa,
      })
      .from(bookWords)
      .innerJoin(words, eq(words.id, bookWords.wordId))
      .innerJoin(books, eq(books.id, bookWords.bookId))
      .where(inArray(books.id, [...bookIds]))
      .orderBy(asc(books.id), asc(bookWords.order));
    const seen = new Set<number>();
    const pool: QuizWord[] = [];
    for (const row of rows) {
      if (!seen.has(row.wordId)) {
        seen.add(row.wordId);
        pool.push(row);
      }
    }
    return pool;
  } catch (error) {
    console.error("[vocabulary:getMultiBookQuizPool] query failed:", error);
    return [];
  }
}

/** Pool theo scope — điều phối 3 nguồn (book cũ / all / multi). */
export async function getQuizPool(scope: QuizScope): Promise<QuizWord[]> {
  if (scope.kind === "book") return getBookQuizPool(scope.bookId);
  if (scope.kind === "all") return getAllQuizPool();
  return getMultiBookQuizPool(scope.bookIds);
}

/** Sinh đề cho book — pool rỗng → đề rỗng (trang render empty state). */
export async function buildBookQuiz(bookId: number): Promise<QuizQuestion[]> {
  return buildQuiz(await getBookQuizPool(bookId));
}

/** Sinh đề theo scope (tab Quiz hub + route API — SF-3 t-3.2). */
export async function buildHubQuiz(scope: QuizScope): Promise<QuizQuestion[]> {
  return buildQuiz(await getQuizPool(scope));
}

export type SubmitQuizOutcome =
  | {
      ok: true;
      score: number;
      correct: number;
      total: number;
      detail: ReturnType<typeof gradeQuiz>["detail"];
    }
  | {
      ok: false;
      error: "bookNotFound" | "poolNotFound" | "invalidAnswer";
    };

/**
 * Chấm + lưu 1 lần làm bài: pool từ DB theo scope (bookNotFound khi book
 * không có từ / poolNotFound khi scope all-multi rỗng), wordId ngoài pool →
 * invalidAnswer (không chấm điểm từ ngoài phạm vi), chấm qua engine PURE rồi
 * insert quiz_attempts — book_id chỉ ghi với scope book; all/multi lưu NULL
 * (migration 0003, topQuizScores không đọc book_id). Insert lỗi rethrow —
 * route trả 500.
 */
export async function submitQuizAttempt(
  userId: string,
  scope: QuizScope,
  mode: QuizMode,
  answers: readonly QuizAnswer[],
): Promise<SubmitQuizOutcome> {
  const pool = await getQuizPool(scope);
  if (pool.length === 0) {
    return {
      ok: false,
      error: scope.kind === "book" ? "bookNotFound" : "poolNotFound",
    };
  }

  const poolIds = new Set(pool.map((w) => w.wordId));
  if (
    answers.length === 0 ||
    answers.some((answer) => !poolIds.has(answer.wordId))
  ) {
    return { ok: false, error: "invalidAnswer" };
  }

  const grade = gradeQuiz(pool, answers);
  try {
    await db.insert(quizAttempts).values({
      userId,
      bookId: scope.kind === "book" ? scope.bookId : null,
      mode,
      score: grade.score,
      detailJson: grade.detail,
    });
  } catch (error) {
    console.error("[vocabulary:submitQuizAttempt] insert failed:", error);
    throw error;
  }
  return {
    ok: true,
    score: grade.score,
    correct: grade.correct,
    total: grade.total,
    detail: grade.detail,
  };
}

export type QuizLeaderboardRow = {
  displayName: string | null;
  avatarUrl: string | null;
  /** MAX score theo user — điểm tốt nhất; SUM sẽ thưởng cho đi làm lại nhiều. */
  bestScore: number;
};

/**
 * Bảng "Điểm quiz" cho /top-users: MAX(score) group by user, cao nhất trước —
 * book-agnostic (kiểm chứng SF-3 t-3.2: không filter book_id, điểm quiz tổng
 * hub scope all/multi book_id NULL vẫn lên bảng). quiz_attempts chưa migrate
 * → [] (không làm đổ trang leaderboard).
 */
export async function topQuizScores(
  limit: number = QUIZ_LEADERBOARD_LIMIT,
): Promise<QuizLeaderboardRow[]> {
  try {
    const rows = await db
      .select({
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        bestScore: sql<number>`max(${quizAttempts.score})`,
      })
      .from(quizAttempts)
      .innerJoin(profiles, eq(profiles.id, quizAttempts.userId))
      .groupBy(profiles.id, profiles.displayName, profiles.avatarUrl)
      .orderBy(desc(sql`max(${quizAttempts.score})`))
      .limit(limit);
    return rows.map((row) => ({ ...row, bestScore: Number(row.bestScore) }));
  } catch (error) {
    console.error("[vocabulary:topQuizScores] query failed:", error);
    return [];
  }
}

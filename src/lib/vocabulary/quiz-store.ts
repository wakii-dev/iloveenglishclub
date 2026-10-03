/**
 * Quiz DB leg (SF-4 t-4.1) — route /api/vocabulary/quiz + trang quiz gọi.
 * Engine buildQuiz/gradeQuiz PURE đã test ở quiz.test.ts; layer này chỉ lo
 * DB (pattern review-store.ts). Bảng chưa migrate → query trả [] (build-safe,
 * cùng fallback getBookVocabulary SF-2).
 */
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, profiles, quizAttempts, words } from "@/db/schema";
import {
  buildQuiz,
  gradeQuiz,
  type QuizAnswer,
  type QuizQuestion,
  type QuizMode,
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

/** Sinh đề cho book — pool rỗng → đề rỗng (trang render empty state). */
export async function buildBookQuiz(bookId: number): Promise<QuizQuestion[]> {
  return buildQuiz(await getBookQuizPool(bookId));
}

export type SubmitQuizOutcome =
  | {
      ok: true;
      score: number;
      correct: number;
      total: number;
      detail: ReturnType<typeof gradeQuiz>["detail"];
    }
  | { ok: false; error: "bookNotFound" | "invalidAnswer" };

/**
 * Chấm + lưu 1 lần làm bài: pool từ DB (bookNotFound khi book không có từ),
 * wordId ngoài pool → invalidAnswer (không chấm điểm từ book khác), chấm qua
 * engine PURE rồi insert quiz_attempts. Insert lỗi rethrow — route trả 500.
 */
export async function submitQuizAttempt(
  userId: string,
  bookId: number,
  mode: QuizMode,
  answers: readonly QuizAnswer[],
): Promise<SubmitQuizOutcome> {
  const pool = await getBookQuizPool(bookId);
  if (pool.length === 0) return { ok: false, error: "bookNotFound" };

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
      bookId,
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
 * Bảng "Điểm quiz" cho /top-users: MAX(score) group by user, cao nhất trước.
 * quiz_attempts chưa migrate → [] (không làm đổ trang leaderboard).
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

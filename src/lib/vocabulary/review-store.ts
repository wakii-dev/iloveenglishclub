/**
 * Review DB leg (SF-3 t-3.2) — route /api/vocabulary/review + trang
 * me/vocabulary gọi. Auth ở ROUTE (session user — pattern me/page.tsx, không
 * phải assertAdmin); engine nextReview PURE đã test riêng ở srs.test.ts.
 * Contract mock @/db: review-store.test.ts.
 */
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { userWordProgress, words } from "@/db/schema";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import { nextReview } from "./srs";

export const DUE_LIMIT = 50;

/** 1 thẻ trong hàng ôn hôm nay — do user_word_progress + words JOIN. */
export type DueWord = {
  wordId: number;
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
  ease: number;
  intervalDays: number;
  reps: number;
};

/**
 * Hàng ôn: progress có due_at ≤ now (đồng hồ DB — không lệch TZ máy chủ
 * app). Cũ nhất đến hạn trước; bảng words có thể chưa migrate → bắt lỗi
 * trả [] (build-safe, cùng fallback getBookVocabulary SF-2).
 */
export async function listDueWords(userId: string): Promise<DueWord[]> {
  try {
    const rows = await db
      .select({
        wordId: words.id,
        word: words.word,
        ipa: words.ipa,
        meaningVi: words.meaningVi,
        example: words.example,
        audioUrl: words.audioUrl,
        ease: userWordProgress.ease,
        intervalDays: userWordProgress.intervalDays,
        reps: userWordProgress.reps,
      })
      .from(userWordProgress)
      .innerJoin(words, eq(words.id, userWordProgress.wordId))
      .where(
        and(
          eq(userWordProgress.userId, userId),
          lte(userWordProgress.dueAt, sql`now()`),
        ),
      )
      .orderBy(asc(userWordProgress.dueAt))
      .limit(DUE_LIMIT);
    return rows;
  } catch (error) {
    console.error("[vocabulary:listDueWords] query failed:", error);
    return [];
  }
}

export type ReviewOutcome =
  | {
      ok: true;
      progress: {
        ease: number;
        intervalDays: number;
        reps: number;
        dueAt: Date;
      };
    }
  | { ok: false; error: "wordNotFound" };

/**
 * Ghi 1 lần ôn: đọc progress hiện có (row mới → engine tự mặc định 2.5/0/0),
 * tính trạng thái kế qua SRS engine, upsert theo PK (user, word).
 * word_id không tồn tại → FK 23503 trên insert → wordNotFound (404-leg).
 */
export async function applyReview(
  userId: string,
  wordId: number,
  quality: number,
): Promise<ReviewOutcome> {
  try {
    const [existing] = await db
      .select({
        ease: userWordProgress.ease,
        intervalDays: userWordProgress.intervalDays,
        reps: userWordProgress.reps,
      })
      .from(userWordProgress)
      .where(
        and(
          eq(userWordProgress.userId, userId),
          eq(userWordProgress.wordId, wordId),
        ),
      )
      .limit(1);

    const next = nextReview({
      ease: existing?.ease,
      intervalDays: existing?.intervalDays,
      reps: existing?.reps,
      quality,
    });
    const reviewedAt = new Date();

    const [row] = await db
      .insert(userWordProgress)
      .values({
        userId,
        wordId,
        ease: next.ease,
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        reps: next.reps,
        lastReviewedAt: reviewedAt,
      })
      .onConflictDoUpdate({
        target: [userWordProgress.userId, userWordProgress.wordId],
        set: {
          ease: next.ease,
          intervalDays: next.intervalDays,
          dueAt: next.dueAt,
          reps: next.reps,
          lastReviewedAt: reviewedAt,
        },
      })
      .returning({
        ease: userWordProgress.ease,
        intervalDays: userWordProgress.intervalDays,
        reps: userWordProgress.reps,
        dueAt: userWordProgress.dueAt,
      });
    if (!row) throw new Error("upsert returned no row");
    return { ok: true, progress: row };
  } catch (error) {
    if (pgErrorCode(error) === "23503") return { ok: false, error: "wordNotFound" };
    throw error;
  }
}

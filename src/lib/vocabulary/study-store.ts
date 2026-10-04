/**
 * Bulk seed "Bắt đầu học sách này" (story vocabulary-learn t-1.2) — seed
 * user_word_progress CHO TẤT CẢ từ của book (book_words.order = thứ tự học)
 * với due_at trải 5 từ/ngày (study-plan.ts). Row SỄN CÓ không đè
 * (onConflictDoNothing PK user+word — giữ nguyên SRS state); ease/interval/
 * reps để default DB (2.5/0/0 — word mới đến hạn ngay theo ngày của nó).
 * Idempotent: chạy lại chỉ thêm từ còn thiếu. DB lỗi → { 0, 0 } build-safe
 * (cùng fallback listDueWords/listHubWords).
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, userWordProgress } from "@/db/schema";
import { planStaggerDueDates } from "./study-plan";

export type BookSeedResult = { added: number; total: number };

export async function seedBookProgress(
  userId: string,
  bookId: number,
): Promise<BookSeedResult> {
  try {
    const rows = await db
      .select({ wordId: bookWords.wordId })
      .from(bookWords)
      .where(eq(bookWords.bookId, bookId))
      .orderBy(asc(bookWords.order));
    if (rows.length === 0) return { added: 0, total: 0 };

    const dueDates = planStaggerDueDates(rows.length);
    const inserted = await db
      .insert(userWordProgress)
      .values(
        rows.map((row, i) => ({
          userId,
          wordId: row.wordId,
          dueAt: dueDates[i]!,
        })),
      )
      .onConflictDoNothing({
        target: [userWordProgress.userId, userWordProgress.wordId],
      })
      .returning({ wordId: userWordProgress.wordId });
    return { added: inserted.length, total: rows.length };
  } catch (error) {
    console.error("[vocabulary:seedBookProgress] seed failed:", error);
    return { added: 0, total: 0 };
  }
}

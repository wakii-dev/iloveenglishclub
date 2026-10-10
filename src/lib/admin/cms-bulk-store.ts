/**
 * Bulk ops DB leg (VU-43 SF-1 task 6) — 1 route /api/admin/vocabulary/bulk.
 * Auth (assertAdmin) ở ROUTE. Semantics spec §5:
 * - cap 500 ids/request (client chunk >500 + aggregate — shape response hỗ trợ)
 * - assign-books: transaction PER BOOK mở pg_advisory_xact_lock(bookId) TRƯỚC
 *   khi đọc max(order) — READ COMMITTED KHÔNG serialize max(order), 2 tx song
 *   song cùng đọc max=10 → 23505; advisory lock = cơ chế serialize thật.
 *   onConflictDoNothing → đã gắn = skipped; FK 23503 → bookNotFound.
 * - tag-cefr: OVERWRITE (teacher intent — khác COALESCE fill-empty của enrich).
 * - delete: dryRun → {willDelete, progressAffected, missing} KHÔNG xoá; apply
 *   per-id lỗi không chặn id khác; cascade book_words/user_word_progress qua FK.
 * - revalidateContent ĐÚNG 1 LẦN cuối batch (KHÔNG trong loop — contract test pin).
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, userWordProgress, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";

export const BULK_CAP = 500;

export type BulkErrorItem = { wordId?: number; bookId?: number; error: string };

export type AssignBooksReport = {
  affected: number; // số link book_words MỚI tạo
  skipped: number; // đã gắn từ trước (onConflictDoNothing)
  errors: BulkErrorItem[]; // per-book lỗi lạ (không chặn book khác); 23503 → bookNotFound
};

export type TagCefrReport = {
  affected: number; // số word bị OVERWRITE cefr
  errors: BulkErrorItem[];
};

export type DeleteDryRunReport = {
  willDelete: number; // ids còn tồn tại
  progressAffected: number; // user_word_progress sẽ cascade
  missing: number[]; // ids không tồn tại
};

export type DeleteApplyReport = {
  affected: number;
  progressAffected: number;
  errors: BulkErrorItem[];
};

export type BookNotFound = { ok: false; error: "bookNotFound" };

/** Đếm progress sẽ cascade cho tập word ids (dùng chung dry-run + apply). */
async function countProgress(wordIds: number[]): Promise<number> {
  if (wordIds.length === 0) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(userWordProgress)
    .where(inArray(userWordProgress.wordId, wordIds));
  return row?.n ?? 0;
}

export type AssignBooksResult =
  | { ok: true; report: AssignBooksReport } // shape khớp response spec §4 {ok, report}
  | BookNotFound;

/**
 * Gắn wordIds vào MỖI bookId: transaction per book — advisory xact lock bookId
 * TRƯỚC max(order) rồi insert nối tiếp onConflictDoNothing (PK book,word →
 * đã gắn = skipped). 23503 (book không tồn tại) → bookNotFound cho cả request;
 * lỗi lạ khác của 1 book ghi errors + chạy tiếp book khác (không chặn).
 */
export async function bulkAssignBooks(
  wordIds: number[],
  bookIds: number[],
): Promise<AssignBooksResult> {
  const report: AssignBooksReport = { affected: 0, skipped: 0, errors: [] };
  for (const bookId of bookIds) {
    try {
      await db.transaction(async (tx) => {
        // pg_advisory_xact_lock tự nhả khi transaction kết thúc (kể cả lỗi);
        // 2 request song song cùng book được serialize trước khi đọc max(order)
        await tx.execute(sql`select pg_advisory_xact_lock(${bookId})`);
        const [maxRow] = await tx
          .select({
            max: sql<number>`coalesce(max(${bookWords.order}), 0)`.mapWith(Number),
          })
          .from(bookWords)
          .where(eq(bookWords.bookId, bookId));
        let order = maxRow?.max ?? 0;
        for (const wordId of wordIds) {
          const [link] = await tx
            .insert(bookWords)
            .values({ bookId, wordId, order: order + 1 })
            .onConflictDoNothing()
            .returning({ wordId: bookWords.wordId });
          if (link) {
            order++;
            report.affected++;
          } else {
            report.skipped++;
          }
        }
      });
    } catch (error) {
      if (pgErrorCode(error) === "23503") {
        // book trước trong list có thể đã mutate → revalidate trước khi fail
        revalidateContent();
        return { ok: false, error: "bookNotFound" };
      }
      report.errors.push({ bookId, error: pgErrorCode(error) ?? "generic" });
    }
  }
  revalidateContent();
  return { ok: true, report };
}

/** Tag CEFR hàng loạt — OVERWRITE giá trị hiện có (khác COALESCE của enrich). */
export async function bulkTagCefr(
  wordIds: number[],
  cefr: string,
): Promise<TagCefrReport> {
  const rows = await db
    .update(words)
    .set({ cefr })
    .where(inArray(words.id, wordIds))
    .returning({ id: words.id });
  revalidateContent();
  return { affected: rows.length, errors: [] };
}

/** Xoá preview (dryRun): đếm sẽ xoá + progress cascade + ids missing — 0 mutation. */
export async function bulkDeleteDryRun(
  wordIds: number[],
): Promise<DeleteDryRunReport> {
  const rows = await db
    .select({ id: words.id })
    .from(words)
    .where(inArray(words.id, wordIds));
  const found = rows.map((r) => r.id);
  const missing = wordIds.filter((id) => !found.includes(id));
  const progressAffected = await countProgress(found);
  return { willDelete: found.length, progressAffected, missing };
}

/**
 * Xoá apply: per-id delete trong transaction riêng — lỗi 1 id (v.g. RESTRICT
 * tương lai) không chặn id khác. progressAffected = đếm THẬT trước xoá
 * (server không tin số client gửi). 1 revalidate cuối batch.
 */
export async function bulkDeleteApply(
  wordIds: number[],
): Promise<DeleteApplyReport> {
  const rows = await db
    .select({ id: words.id })
    .from(words)
    .where(inArray(words.id, wordIds));
  const found = rows.map((r) => r.id);
  const progressAffected = await countProgress(found);
  const report: DeleteApplyReport = { affected: 0, progressAffected, errors: [] };
  for (const id of found) {
    try {
      const [deleted] = await db
        .delete(words)
        .where(eq(words.id, id))
        .returning({ id: words.id });
      if (deleted) report.affected++;
    } catch (error) {
      report.errors.push({ wordId: id, error: pgErrorCode(error) ?? "generic" });
    }
  }
  revalidateContent();
  return report;
}

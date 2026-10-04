/**
 * Vocabulary DB leg (SF-1 t-1.2) — route /api/admin/vocabulary gọi; auth
 * (assertAdmin) ở ROUTE theo pattern upload route (trust boundary spec §3).
 * Pure validate/parse ở vocabulary.ts. Mọi mutation revalidate content
 * (SF-2 public vocabulary page đọc — matrix spec §5).
 */
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import type { ParsedWordRow, WordInput } from "./vocabulary";

export type VocabularyListParams = {
  bookId?: number;
  q?: string;
  limit: number;
  offset: number;
};

export type VocabularyListItem = WordInput & {
  id: number;
  createdAt: Date;
  bookIds: number[];
};

export async function listVocabulary({
  bookId,
  q,
  limit,
  offset,
}: VocabularyListParams): Promise<{
  items: VocabularyListItem[];
  total: number;
}> {
  // bookId lọc qua JOIN book_words (constraint book_id đi kèm WHERE) — q
  // ilike trên words đủ dùng standalone; custom select shape giữ phẳng khi join
  const rowsQuery = db
    .select({
      id: words.id,
      word: words.word,
      ipa: words.ipa,
      meaningVi: words.meaningVi,
      example: words.example,
      audioUrl: words.audioUrl,
      cefr: words.cefr,
      source: words.source,
      createdAt: words.createdAt,
    })
    .from(words)
    .$dynamic();
  const countQuery = db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(words)
    .$dynamic();

  const cond = (withBook: boolean) =>
    and(
      ...(withBook && bookId !== undefined ? [eq(bookWords.bookId, bookId)] : []),
      ...(q ? [ilike(words.word, `%${q}%`)] : []),
    );

  const joinedRows =
    bookId !== undefined
      ? rowsQuery.innerJoin(bookWords, eq(bookWords.wordId, words.id))
      : rowsQuery;
  const joinedCount =
    bookId !== undefined
      ? countQuery.innerJoin(bookWords, eq(bookWords.wordId, words.id))
      : countQuery;

  const rows = await joinedRows
    .where(cond(bookId !== undefined))
    .orderBy(desc(words.createdAt), asc(words.word))
    .limit(limit)
    .offset(offset);
  const [count] = await joinedCount.where(cond(bookId !== undefined));

  // bookIds gom 1 query cho page hiện tại — không fan-out per-row
  const ids = rows.map((r) => r.id);
  const links =
    ids.length > 0
      ? await db
          .select({ wordId: bookWords.wordId, bookId: bookWords.bookId })
          .from(bookWords)
          .where(inArray(bookWords.wordId, ids))
      : [];
  const byWord = new Map<number, number[]>();
  for (const link of links) {
    const list = byWord.get(link.wordId) ?? [];
    list.push(link.bookId);
    byWord.set(link.wordId, list);
  }

  return {
    items: rows.map((w) => ({
      id: w.id,
      word: w.word,
      ipa: w.ipa,
      meaning_vi: w.meaningVi,
      example: w.example,
      audio_url: w.audioUrl,
      cefr: w.cefr,
      source: w.source,
      createdAt: w.createdAt,
      bookIds: byWord.get(w.id) ?? [],
    })),
    total: count?.n ?? 0,
  };
}

export type CreateWordResult =
  | { ok: true; id: number; duplicate: boolean }
  | { ok: false; error: "bookNotFound" };

/**
 * Create word + attach vào bookIds (order = max+1 mỗi book, cùng pattern
 * lessons.number). Word đã tồn tại → KHÔNG lỗi: trả duplicate=true và vẫn
 * attach (re-run teacher không chết giữa chừng).
 */
export async function createVocabularyWord(
  input: WordInput,
  bookIds: number[],
): Promise<CreateWordResult> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(words)
        .values({
          word: input.word,
          ipa: input.ipa,
          meaningVi: input.meaning_vi,
          example: input.example,
          audioUrl: input.audio_url,
          // SF-2 crawl-on-add: cefr/source chỉ có khi approve set — import không đụng
          cefr: input.cefr ?? null,
          source: input.source ?? null,
        })
        .onConflictDoNothing({ target: words.word })
        .returning({ id: words.id });
      let id = row?.id;
      let duplicate = false;
      if (id === undefined) {
        duplicate = true;
        const [existing] = await tx
          .select({ id: words.id })
          .from(words)
          .where(eq(words.word, input.word))
          .limit(1);
        id = existing?.id;
        // SF-2: word reuse vẫn set cefr/source — COALESCE giữ giá trị có sẵn
        // (fill-empty spirit; import path không có 2 trường này → no-op)
        if (id !== undefined && (input.cefr !== undefined || input.source !== undefined)) {
          await tx
            .update(words)
            .set({
              cefr: sql`coalesce(${words.cefr}, ${input.cefr ?? null})`,
              source: sql`coalesce(${words.source}, ${input.source ?? null})`,
            })
            .where(eq(words.id, id));
        }
      }
      if (id === undefined) throw new Error("word insert/select returned none");

      for (const bookId of bookIds) {
        const [maxRow] = await tx
          .select({
            max: sql<number>`coalesce(max(${bookWords.order}), 0)`.mapWith(Number),
          })
          .from(bookWords)
          .where(eq(bookWords.bookId, bookId));
        await tx
          .insert(bookWords)
          .values({ bookId, wordId: id, order: (maxRow?.max ?? 0) + 1 })
          .onConflictDoNothing();
      }
      revalidateContent();
      return { ok: true, id, duplicate };
    });
  } catch (error) {
    if (pgErrorCode(error) === "23503") return { ok: false, error: "bookNotFound" };
    throw error;
  }
}

export type UpdateWordResult =
  | { ok: true }
  | { ok: false; error: "notFound" | "duplicateWord" };

/** Patch theo property-name Drizzle (meaningVi) — route map từ snake_case body. */
export type WordPatch = Partial<{
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
}>;

export async function updateVocabularyWord(
  id: number,
  patch: WordPatch,
): Promise<UpdateWordResult> {
  try {
    const [row] = await db
      .update(words)
      .set(patch)
      .where(eq(words.id, id))
      .returning({ id: words.id });
    if (!row) return { ok: false, error: "notFound" };
    revalidateContent();
    return { ok: true };
  } catch (error) {
    if (pgErrorCode(error) === "23505") return { ok: false, error: "duplicateWord" };
    throw error;
  }
}

export async function deleteVocabularyWord(id: number): Promise<boolean> {
  try {
    // cascade book_words + user_word_progress (schema comment) — v1 chấp nhận
    // mất progress khi xoá word, admin đỡ bước dồn thứ tự
    const [row] = await db
      .delete(words)
      .where(eq(words.id, id))
      .returning({ id: words.id });
    const deleted = row !== undefined;
    if (deleted) revalidateContent();
    return deleted;
  } finally {
    // not-found vẫn xoá sạch query phía trên — không path lỗi khác thoát ra
  }
}

export type ImportReport = {
  imported: number;
  linked: number;
  skipped: number;
  errors: { line: number; word: string; error: string }[];
};

/**
 * Bulk import 1 book: word mới INSERT, word có sẵn REUSE (unique words.word —
 * cùng word ở nhiều book là state hợp lệ), attach book_words idempotent
 * (onConflictDoNothing → skipped). order nối tiếp max hiện có trong
 * transaction; race 2 import → unique book+order chặn, re-run an toàn.
 */
export async function importVocabulary(
  bookId: number,
  rows: ParsedWordRow[],
): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, linked: 0, skipped: 0, errors: [] };
  if (rows.length === 0) return report;
  await db.transaction(async (tx) => {
    const [maxRow] = await tx
      .select({
        max: sql<number>`coalesce(max(${bookWords.order}), 0)`.mapWith(Number),
      })
      .from(bookWords)
      .where(eq(bookWords.bookId, bookId));
    let order = maxRow?.max ?? 0;
    for (const row of rows) {
      const [inserted] = await tx
        .insert(words)
        .values({
          word: row.word,
          ipa: row.ipa,
          meaningVi: row.meaning_vi,
          example: row.example,
          audioUrl: row.audio_url,
        })
        .onConflictDoNothing({ target: words.word })
        .returning({ id: words.id });
      let wordId = inserted?.id;
      if (wordId !== undefined) {
        report.imported++;
      } else {
        const [existing] = await tx
          .select({ id: words.id })
          .from(words)
          .where(eq(words.word, row.word))
          .limit(1);
        wordId = existing?.id;
      }
      if (wordId === undefined) {
        report.errors.push({ line: row.line, word: row.word, error: "notFound" });
        continue;
      }
      const [link] = await tx
        .insert(bookWords)
        .values({ bookId, wordId, order: order + 1 })
        .onConflictDoNothing()
        .returning({ wordId: bookWords.wordId });
      if (link) {
        order++;
        report.linked++;
      } else {
        report.skipped++;
      }
    }
  });
  revalidateContent();
  return report;
}

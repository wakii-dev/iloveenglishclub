/**
 * Vocabulary DB leg (SF-1 t-1.2) — route /api/admin/vocabulary gọi; auth
 * (assertAdmin) ở ROUTE theo pattern upload route (trust boundary spec §3).
 * Pure validate/parse ở vocabulary.ts. Mọi mutation revalidate content
 * (SF-2 public vocabulary page đọc — matrix spec §5).
 */
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import { escapeLikePattern, type CefrLevel, type ParsedWordRow, type WordInput } from "./vocabulary";

/** Sort spec §4: created (mặc định — desc createdAt, tiebreak word) | word asc
 *  | cefr asc — PG ASC mặc định NULLS LAST ⇒ cefr null xuống cuối (spec pin). */
function orderByFor(sort: NonNullable<VocabularyListParams["sort"]>) {
  if (sort === "word") return [asc(words.word)];
  if (sort === "cefr") return [asc(words.cefr), asc(words.word)];
  return [desc(words.createdAt), asc(words.word)];
}

export type VocabularyListParams = {
  bookId?: number;
  q?: string;
  limit: number;
  offset: number;
  // VU-43 SF-1 (v2 — additive, signature cũ chạy nguyên):
  cefr?: CefrLevel[]; // normalized A1..C2 (route parse qua parseCefrFilter)
  source?: "oxford-ld" | "teacher";
  audio?: "has" | "missing";
  orphan?: boolean; // WIN khi conflict bookId (bookId bị ignore)
  sort?: "created" | "word" | "cefr";
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
  cefr,
  source,
  audio,
  orphan,
  sort = "created",
}: VocabularyListParams): Promise<{
  items: VocabularyListItem[];
  total: number;
}> {
  // bookId lọc qua JOIN book_words (constraint book_id đi kèm WHERE) — q
  // ilike trên words đủ dùng standalone; custom select shape giữ phẳng khi join.
  // orphan=1 → LEFT JOIN … IS NULL (spec §4: WIN khi conflict bookId).
  const joinBook = bookId !== undefined && !orphan;
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
      pos: words.pos,
      imageUrl: words.imageUrl,
      synonyms: words.synonyms,
      createdAt: words.createdAt,
    })
    .from(words)
    .$dynamic();
  const countQuery = db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(words)
    .$dynamic();

  const like = q ? `%${escapeLikePattern(q)}%` : null;
  const cond = (withBook: boolean) =>
    and(
      ...(withBook && joinBook ? [eq(bookWords.bookId, bookId!)] : []),
      ...(orphan ? [isNull(bookWords.bookId)] : []),
      ...(like ? [or(ilike(words.word, like), ilike(words.meaningVi, like))] : []),
      ...(cefr && cefr.length > 0
        ? // normalized equality: 'b1 ' dữ vẫn match B1 (spec §4)
          [inArray(sql`upper(trim(${words.cefr}))`, cefr)]
        : []),
      ...(source === "oxford-ld" ? [eq(words.source, "oxford-ld")] : []),
      ...(source === "teacher" ? [isNull(words.source)] : []),
      ...(audio === "has" ? [isNotNull(words.audioUrl)] : []),
      ...(audio === "missing" ? [isNull(words.audioUrl)] : []),
    );

  const joinedRows =
    joinBook
      ? rowsQuery.innerJoin(bookWords, eq(bookWords.wordId, words.id))
      : orphan
        ? rowsQuery.leftJoin(bookWords, eq(bookWords.wordId, words.id))
        : rowsQuery;
  const joinedCount =
    joinBook
      ? countQuery.innerJoin(bookWords, eq(bookWords.wordId, words.id))
      : orphan
        ? countQuery.leftJoin(bookWords, eq(bookWords.wordId, words.id))
        : countQuery;

  const rows = await joinedRows
    .where(cond(joinBook))
    .orderBy(...orderByFor(sort))
    .limit(limit)
    .offset(offset);
  const [count] = await joinedCount.where(cond(joinBook));

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
      // VU-43 SF-1 (nullable — consumer cũ bỏ qua an toàn, spec §4)
      pos: w.pos,
      image_url: w.imageUrl,
      synonyms: w.synonyms,
      createdAt: w.createdAt,
      bookIds: byWord.get(w.id) ?? [],
    })),
    total: count?.n ?? 0,
  };
}

export type CreateWordResult =
  | { ok: true; id: number; duplicate: boolean }
  | { ok: false; error: "bookNotFound" };

/** Drizzle transaction type (test mock cần shape tương thích). */
export type VocabularyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Insert 1 word (semantics createVocabularyWord: unique words.word case-
 * sensitive, onConflictDoNothing → undefined khi trùng). Shared leg cho
 * createVocabularyWord + promote-store (VU-43 SF-1 — cùng 1 semantics insert).
 */
export async function insertWordReturningId(
  tx: VocabularyTx,
  input: WordInput,
): Promise<number | undefined> {
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
      // VU-43 SF-1: field mới — import path cũ không gửi → null
      pos: input.pos ?? null,
      synonyms: input.synonyms ?? null,
      imageUrl: input.image_url ?? null,
    })
    .onConflictDoNothing({ target: words.word })
    .returning({ id: words.id });
  return row?.id;
}

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
      const insertedId = await insertWordReturningId(tx, input);
      let id = insertedId;
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

/** Patch theo property-name Drizzle (meaningVi) — route map từ snake_case body.
 *  VU-43 SF-1: + cefr/source/pos/imageUrl/synonyms (validate ở route). */
export type WordPatch = Partial<{
  word: string;
  ipa: string | null;
  meaningVi: string;
  example: string | null;
  audioUrl: string | null;
  cefr: string | null;
  source: string | null;
  pos: string | null;
  imageUrl: string | null;
  synonyms: string | null;
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

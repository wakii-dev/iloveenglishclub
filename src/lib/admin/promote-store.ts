/**
 * Promote crawl_entries → words (VU-43 SF-1 task 11) — teacher-in-loop batch
 * (meaning VI nhập tay — no-LLM quy ước; meaningVi NOT NULL giữ nguyên).
 *
 * Semantics spec §2.2/§5:
 * - meanings validate TRƯỚC mutation nào (meaningRequired) — route chặn.
 * - 1 transaction per book mở pg_advisory_xact_lock(bookId) TRƯỚC max(order)
 *   (cùng cơ chế bulk assign — 2 promote song song cùng book serialize).
 * - insert qua insertWordReturningId (share semantics createVocabularyWord —
 *   unique case-sensitive); trùng theo duplicate predicate §4 → skip đếm
 *   duplicates (KHÔNG reuse/attach — teacher xem badge rồi merge bằng tay).
 * - word trim nguyên văn; ipa uk→us; cefr normalize (lệch allowlist → null);
 *   pos lowercase-trim; source='oxford-ld'; audio blob best-effort; example
 *   raw->'senses'->0->'examples'->>0 nếu derive được; meaning VI = teacher.
 * - report {created, duplicates, failed:[{entryId, error}]}; FK 23503 →
 *   bookNotFound; revalidate ĐÚNG 1 LẦN cuối batch (pin). KHÔNG UPDATE
 *   crawl_entries.status — lake read-only.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, crawlEntries, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { pgErrorCode } from "@/lib/actions/admin/pg-errors";
import { isCefrLevel, normalizeCefr, validatePosInput } from "./vocabulary";
import { insertWordReturningId } from "./vocabulary-store";

export const PROMOTE_CAP = 200;

export type PromoteReport = {
  created: number;
  duplicates: number;
  failed: { entryId: number; error: string }[];
};

export type PromoteResult =
  | { ok: true; report: PromoteReport }
  | { ok: false; error: "bookNotFound" };

export type PromoteEntryRow = {
  id: number;
  word: string | null;
  ipaUk: string | null;
  ipaUs: string | null;
  cefr: string | null;
  pos: string | null;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
  example: string | null;
};

/**
 * Fetch entries theo ids + example derive trong SQL từ raw sense 1 (cùng
 * expression enrich fetchCandidates — không chỉnh parse.ts). order id asc —
 * report deterministic.
 */
export async function fetchPromotableEntries(
  entryIds: number[],
): Promise<PromoteEntryRow[]> {
  return db
    .select({
      id: crawlEntries.id,
      word: crawlEntries.word,
      ipaUk: crawlEntries.ipaUk,
      ipaUs: crawlEntries.ipaUs,
      cefr: crawlEntries.cefr,
      pos: crawlEntries.pos,
      audioUkBlob: crawlEntries.audioUkBlob,
      audioUsBlob: crawlEntries.audioUsBlob,
      example: sql<string | null>`${crawlEntries.raw}->'senses'->0->'examples'->>0`,
    })
    .from(crawlEntries)
    .where(inArray(crawlEntries.id, entryIds))
    .orderBy(asc(crawlEntries.id));
}

/**
 * Batch promote vào 1 book. Entry thiếu word → failed invalidEntryWord (per-
 * entry, không chặn); word trùng theo duplicate predicate → duplicates++;
 * insert trùng case-sensitive exact → duplicates (insert conflict).
 */
export async function promoteCrawlEntries(
  entryIds: number[],
  bookId: number,
  meanings: Record<string, string>,
): Promise<PromoteResult> {
  const entries = await fetchPromotableEntries(entryIds);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const report: PromoteReport = { created: 0, duplicates: 0, failed: [] };

  // duplicate predicate §4 — 1 query cho cả batch (lower+trim 2 phía)
  const headwords = [
    ...new Set(
      entries
        .filter((e) => e.word !== null && e.word.trim().length > 0)
        .map((e) => e.word!.trim().toLowerCase()),
    ),
  ];
  const existing =
    headwords.length > 0
      ? await db
          .select({ hw: sql<string>`lower(trim(${words.word}))` })
          .from(words)
          .where(inArray(sql`lower(trim(${words.word}))`, headwords))
      : [];
  const dupSet = new Set(existing.map((r) => r.hw));

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${bookId})`);
      const [maxRow] = await tx
        .select({
          max: sql<number>`coalesce(max(${bookWords.order}), 0)`.mapWith(Number),
        })
        .from(bookWords)
        .where(eq(bookWords.bookId, bookId));
      let order = maxRow?.max ?? 0;

      for (const entryId of entryIds) {
        const entry = byId.get(entryId);
        if (!entry) {
          report.failed.push({ entryId, error: "notFound" });
          continue;
        }
        const word = entry.word?.trim() ?? "";
        if (!word) {
          report.failed.push({ entryId, error: "invalidEntryWord" });
          continue;
        }
        if (dupSet.has(word.toLowerCase())) {
          report.duplicates++;
          continue;
        }
        const cefrRaw = entry.cefr ? normalizeCefr(entry.cefr) : null;
        const posRaw = validatePosInput(entry.pos);
        const id = await insertWordReturningId(tx, {
          word,
          meaning_vi: meanings[String(entryId)].trim(),
          ipa: entry.ipaUk ?? entry.ipaUs,
          example: entry.example,
          audio_url: entry.audioUkBlob ?? entry.audioUsBlob,
          cefr: cefrRaw !== null && isCefrLevel(cefrRaw) ? cefrRaw : null,
          source: "oxford-ld",
          pos: posRaw === null || typeof posRaw === "object" ? null : posRaw,
        });
        if (id === undefined) {
          // race exact-case (unique words.word) — vẫn là duplicate theo
          // predicate (same lower) → skip đếm, không chết batch
          report.duplicates++;
          continue;
        }
        dupSet.add(word.toLowerCase());
        const [link] = await tx
          .insert(bookWords)
          .values({ bookId, wordId: id, order: order + 1 })
          .onConflictDoNothing()
          .returning({ wordId: bookWords.wordId });
        if (link) order++;
        report.created++;
      }
    });
    revalidateContent(); // 1 lần cuối batch — pin
    return { ok: true, report };
  } catch (error) {
    if (pgErrorCode(error) === "23503") return { ok: false, error: "bookNotFound" };
    throw error;
  }
}

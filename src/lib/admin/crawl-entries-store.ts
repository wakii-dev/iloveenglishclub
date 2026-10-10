/**
 * Crawl-entries read store (VU-43 SF-1 task 10) — curation browse 63.9k rows:
 * pagination SERVER-SIDE (index-supported sau migration 0007 — spec cấm LIMIT
 * lớn client-side). READ-ONLY lake (KHÔNG đụng status machine VU-32).
 *
 * hasWord theo DUPLICATE PREDICATE (spec §4 — 1 rule chung với badge/promote):
 * lower(trim(entry.word)) == lower(trim(words.word)) — 1 query cho cả page
 * (KHÔNG per-row fan-out). q match word COALESCE pretty slug (slugBase — reuse
 * export enrich.ts).
 */
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { crawlEntries, words } from "@/db/schema";
import { slugBase } from "@/lib/oxford/enrich";
import { escapeLikePattern, type CefrLevel } from "./vocabulary";

export type CrawlEntriesParams = {
  status?: string; // default 'parsed'
  q?: string;
  cefr?: CefrLevel[]; // normalized (route parse qua parseCefrFilter)
  pos?: string;
  ox3000?: boolean;
  limit: number;
  offset: number;
};

export type CrawlEntryItem = {
  id: number;
  slug: string;
  word: string | null;
  ipaUk: string | null;
  ipaUs: string | null;
  cefr: string | null;
  pos: string | null;
  ox3000: boolean;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
  hasWord: boolean;
};

/** Pretty slug: base_N strip + '-' → space (hiển thị khi headword null). */
export function prettySlug(slug: string): string {
  return slugBase(slug).replace(/-/g, " ");
}

export async function listCrawlEntries({
  status = "parsed",
  q,
  cefr,
  pos,
  ox3000,
  limit,
  offset,
}: CrawlEntriesParams): Promise<{ items: CrawlEntryItem[]; total: number }> {
  const like = q ? `%${escapeLikePattern(q)}%` : null;
  const where = and(
    eq(crawlEntries.status, status),
    // q: headword COALESCE pretty slug (slug _N strip + dash→space trong SQL)
    ...(like
      ? [
          or(
            ilike(crawlEntries.word, like),
            sql`replace(regexp_replace(${crawlEntries.slug}, '_[0-9]+$', ''), '-', ' ') ilike ${like}`,
          ),
        ]
      : []),
    ...(cefr && cefr.length > 0
      ? // normalized equality như listVocabulary — 'b1 ' dữ vẫn match B1
        [inArray(sql`upper(trim(${crawlEntries.cefr}))`, cefr)]
      : []),
    ...(pos ? [ilike(crawlEntries.pos, escapeLikePattern(pos))] : []),
    ...(ox3000 !== undefined ? [eq(crawlEntries.ox3000, ox3000)] : []),
  );

  const rows = await db
    .select({
      id: crawlEntries.id,
      slug: crawlEntries.slug,
      word: crawlEntries.word,
      ipaUk: crawlEntries.ipaUk,
      ipaUs: crawlEntries.ipaUs,
      cefr: crawlEntries.cefr,
      pos: crawlEntries.pos,
      ox3000: crawlEntries.ox3000,
      audioUkBlob: crawlEntries.audioUkBlob,
      audioUsBlob: crawlEntries.audioUsBlob,
    })
    .from(crawlEntries)
    .where(where)
    .orderBy(asc(crawlEntries.id))
    .limit(limit)
    .offset(offset);
  const [countRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(crawlEntries)
    .where(where);

  // hasWord: 1 query cho cả page — duplicate predicate §4 (lower+trim 2 phía)
  const headwords = [
    ...new Set(
      rows
        .filter((r) => r.word !== null && r.word.trim().length > 0)
        .map((r) => r.word!.trim().toLowerCase()),
    ),
  ];
  const existing =
    headwords.length > 0
      ? await db
          .select({ hw: sql<string>`lower(trim(${words.word}))` })
          .from(words)
          .where(inArray(sql`lower(trim(${words.word}))`, headwords))
      : [];
  const existingSet = new Set(existing.map((r) => r.hw));

  return {
    items: rows.map((r) => ({
      ...r,
      hasWord:
        r.word !== null && existingSet.has(r.word.trim().toLowerCase()),
    })),
    total: countRow?.n ?? 0,
  };
}

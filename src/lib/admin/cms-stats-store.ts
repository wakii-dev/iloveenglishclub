/**
 * Stats DB leg (VU-43 SF-1 task 8) — 1 route /api/admin/vocabulary/stats.
 * DERIVED numbers (không bảng mới). Histogram buckets PIN spec §5.8: khớp
 * EXACT A1..C2 (raw) → bucket; NULL → untagged; giá trị khác (kể cả 'b2 '
 * bẩn) → other — TỔNG buckets = tổng words (group by trên cùng bảng).
 * crawl reuse crawlStatsDb (enrich.ts — đừng viết lại, spec pin).
 */
import { count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, books, words } from "@/db/schema";
import { crawlStatsDb, type CrawlStats } from "@/lib/oxford/enrich";
import { CEFR_LEVELS, type CefrLevel } from "./vocabulary";

export type CefrBucket = CefrLevel | "untagged" | "other";

export type CefrHistogram = Record<CefrBucket, number>;

/**
 * Bucket rule (PURE — test pin 'b2 ' → other): exact raw match A1..C2;
 * NULL → untagged; lạ → other. KHÔNG normalize ở đây — normalize chỉ dùng
 * cho FILTER list (cefr=b1 match B1), bucket thống kê đo data thật.
 */
export function cefrBucket(raw: string | null): CefrBucket {
  if (raw === null) return "untagged";
  if ((CEFR_LEVELS as readonly string[]).includes(raw)) return raw as CefrLevel;
  return "other";
}

export type BookStat = {
  bookId: number;
  title: string;
  words: number;
  withAudio: number;
};

export type CmsStats = {
  totals: {
    words: number;
    withAudio: number;
    withImage: number;
    orphan: number;
    enriched: number; // source = 'oxford-ld'
  };
  cefrHistogram: CefrHistogram;
  perSource: Record<string, number>; // 'oxford-ld' | 'teacher' (source NULL)
  perBook: BookStat[];
  crawl: CrawlStats;
};

export async function cmsStatsDb(): Promise<CmsStats> {
  const [totalsRow] = await db
    .select({
      words: count(),
      withAudio: sql<number>`count(*) filter (where ${words.audioUrl} is not null)`.mapWith(Number),
      withImage: sql<number>`count(*) filter (where ${words.imageUrl} is not null)`.mapWith(Number),
      enriched: sql<number>`count(*) filter (where ${words.source} = 'oxford-ld')`.mapWith(Number),
    })
    .from(words);
  const [orphanRow] = await db
    .select({ n: count() })
    .from(words)
    .leftJoin(bookWords, eq(bookWords.wordId, words.id))
    .where(isNull(bookWords.bookId));

  // Histogram: group theo RAW cefr (1 query) rồi bucket JS — rule đo được unit
  const rawGroups = await db
    .select({ cefr: words.cefr, n: count() })
    .from(words)
    .groupBy(words.cefr);
  const histogram = Object.fromEntries(
    [...CEFR_LEVELS, "untagged", "other"].map((k) => [k, 0]),
  ) as CefrHistogram;
  for (const group of rawGroups) {
    histogram[cefrBucket(group.cefr)] += group.n;
  }

  const sourceGroups = await db
    .select({
      source: sql<string | null>`${words.source}`,
      n: count(),
    })
    .from(words)
    .groupBy(words.source);
  const perSource: Record<string, number> = {};
  for (const group of sourceGroups) {
    perSource[group.source ?? "teacher"] = group.n;
  }

  const perBookRows = await db
    .select({
      bookId: books.id,
      title: sql<string>`coalesce(${books.titleVi}, ${books.titleEn})`,
      words: count(bookWords.wordId),
      withAudio:
        sql<number>`count(${words.id}) filter (where ${words.audioUrl} is not null)`.mapWith(Number),
    })
    .from(books)
    .leftJoin(bookWords, eq(bookWords.bookId, books.id))
    .leftJoin(words, eq(words.id, bookWords.wordId))
    .groupBy(books.id, books.titleVi, books.titleEn)
    .orderBy(books.id);

  const crawl = await crawlStatsDb();

  return {
    totals: {
      words: totalsRow?.words ?? 0,
      withAudio: totalsRow?.withAudio ?? 0,
      withImage: totalsRow?.withImage ?? 0,
      orphan: orphanRow?.n ?? 0,
      enriched: totalsRow?.enriched ?? 0,
    },
    cefrHistogram: histogram,
    perSource,
    perBook: perBookRows.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      words: r.words,
      withAudio: r.withAudio,
    })),
    crawl,
  };
}

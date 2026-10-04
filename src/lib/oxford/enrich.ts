/**
 * Enrichment fill-empty (VU-32 SF-2) — builder PURE + DB leg (drizzle @/db,
 * pattern vocabulary-store.ts; route gọi, auth assertAdmin ở ROUTE).
 *
 * Contract spec §[enrich]: chỉ điền field đang NULL — giá trị teacher có sẵn
 * (kể cả chuỗi rỗng sau trim) TÔN TRỌNG. ipa uk→us→skip · example: example
 * đầu sense 1 → skip · cefr thô → skip nếu null · audio: audio_uk_blob→
 * audio_us_blob→skip (BLOB-ONLY — thiếu blob → reason 'noAudioBlob').
 * words.source='oxford-ld' CHỈ khi ≥1 field được fill. Emptiness apply-time:
 * UPDATE COALESCE(col, value) — race-safe, không clobber giá trị ghi giữa chừng.
 * Sau apply gọi revalidateContent() (pattern importVocabulary).
 */
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, crawlEntries, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { RETRY_ATTEMPTS_CAP, UPSERT_BATCH_SIZE, type SqlClient } from "./store";
import { fetchSlugs } from "./sitemap";
import { fetchEntry } from "./fetch";
import { parseEntry } from "./parse";
import { matchWord } from "./match";

export const ENRICH_MAX_WORDS = 200;

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

export type FieldName = "ipa" | "example" | "cefr" | "audio";

/** Row words đủ field enrich (resolve từ bookId/wordIds). */
export type EnrichWordRow = {
  id: number;
  word: string;
  ipa: string | null;
  example: string | null;
  audioUrl: string | null;
  cefr: string | null;
};

/** Candidate crawl_entries đủ field enrich (winner theo matchWord). */
export type EnrichEntryData = {
  id: number;
  slug: string;
  word: string | null;
  cefr: string | null;
  pos: string | null;
  ipaUk: string | null;
  ipaUs: string | null;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
  /** example đầu sense 1 — derive trong SQL từ raw->'senses'->0. */
  example: string | null;
};

export type FillFields = {
  ipa?: string;
  example?: string;
  cefr?: string;
  audioUrl?: string;
};

export type FillOutcome = {
  fills: FillFields;
  filled: FieldName[];
  /** Field word ĐÃ CÓ giá trị nên không đụng. */
  skipped: FieldName[];
  /** 'noAudioBlob' khi audio trống mà entry không có blob nào. */
  reason?: "noAudioBlob";
};

/** empty = CHỈ null — chuỗi rỗng teacher nhập là giá trị được tôn trọng. */
export function buildFill(word: EnrichWordRow, entry: EnrichEntryData | null): FillOutcome {
  const fills: FillFields = {};
  const filled: FieldName[] = [];
  const skipped: FieldName[] = [];

  if (entry !== null) {
    if (word.ipa === null) {
      const ipa = entry.ipaUk ?? entry.ipaUs;
      if (ipa !== null) {
        fills.ipa = ipa;
        filled.push("ipa");
      }
    } else skipped.push("ipa");

    if (word.example === null) {
      if (entry.example !== null) {
        fills.example = entry.example;
        filled.push("example");
      }
    } else skipped.push("example");

    if (word.cefr === null) {
      if (entry.cefr !== null) {
        fills.cefr = entry.cefr;
        filled.push("cefr");
      }
    } else skipped.push("cefr");

    if (word.audioUrl === null) {
      const blob = entry.audioUkBlob ?? entry.audioUsBlob;
      if (blob !== null) {
        fills.audioUrl = blob;
        filled.push("audio");
      } else {
        // audio trống + entry không blob — gợi ý chạy phase audio (spec §[enrich])
        return { fills, filled, skipped, reason: "noAudioBlob" };
      }
    } else skipped.push("audio");
    return { fills, filled, skipped };
  }

  // noMatch — chỉ liệt kê field word đã có (skipped vì đã có giá trị)
  if (word.ipa !== null) skipped.push("ipa");
  if (word.example !== null) skipped.push("example");
  if (word.cefr !== null) skipped.push("cefr");
  if (word.audioUrl !== null) skipped.push("audio");
  return { fills, filled, skipped };
}

/** Word → slug candidate: normalizeMatch rồi spaces→dash (slug không có space). */
export function slugBase(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/_\d+$/, "")
    .replace(/\s+/g, " ")
    .replace(/ /g, "-");
}

function escapeRegex(x: string): string {
  return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pattern homograph slug `base_N` (bank_1…) — anchor 2 đầu. */
export function slugPatterns(word: string): string[] {
  return [`^${escapeRegex(slugBase(word))}_[0-9]+$`];
}

// ---------------------------------------------------------------------------
// DB leg
// ---------------------------------------------------------------------------

export class EnrichCapError extends Error {
  constructor(count: number) {
    super(`enrich cap ${ENRICH_MAX_WORDS} từ/request (nhận ${count}) — SF-3 loop batch theo wordIds`);
    this.name = "EnrichCapError";
  }
}

export type DryRunCounts = {
  candidates: number;
  fillableIpa: number;
  fillableExample: number;
  fillableCefr: number;
  fillableAudio: number;
};

export type EnrichReportItem = {
  word: string;
  filled: FieldName[];
  skipped: FieldName[];
  reason?: "noMatch" | "noAudioBlob";
};

async function resolveWordRows(args: {
  bookId?: number;
  wordIds?: number[];
}): Promise<EnrichWordRow[]> {
  const select = {
    id: words.id,
    word: words.word,
    ipa: words.ipa,
    example: words.example,
    audioUrl: words.audioUrl,
    cefr: words.cefr,
  };
  if (args.bookId !== undefined) {
    return db
      .select(select)
      .from(words)
      .innerJoin(bookWords, eq(bookWords.wordId, words.id))
      .where(eq(bookWords.bookId, args.bookId))
      // +1 để phân biệt "đúng 200" vs "còn nữa" → EnrichCapError (route → 400)
      .limit(ENRICH_MAX_WORDS + 1);
  }
  return db
    .select(select)
    .from(words)
    .where(inArray(words.id, args.wordIds ?? []))
    .limit(ENRICH_MAX_WORDS + 1);
}

/**
 * Fetch candidate crawl_entries cho cả batch (1 query — superset: slug exact
 * + slug homograph `base_N` + headword trim+lower). Winner chọn sau trong TS
 * (matchWord — pure, deterministic).
 */
async function fetchCandidates(rawWords: string[]): Promise<EnrichEntryData[]> {
  const hws = [...new Set(rawWords.map((w) => w.trim().toLowerCase()))].filter(Boolean);
  if (hws.length === 0) return [];
  const bases = [...new Set(hws.map(slugBase))];
  const patterns = [...new Set(hws.flatMap(slugPatterns))];
  return db
    .select({
      id: crawlEntries.id,
      slug: crawlEntries.slug,
      word: crawlEntries.word,
      cefr: crawlEntries.cefr,
      pos: crawlEntries.pos,
      ipaUk: crawlEntries.ipaUk,
      ipaUs: crawlEntries.ipaUs,
      audioUkBlob: crawlEntries.audioUkBlob,
      audioUsBlob: crawlEntries.audioUsBlob,
      example: sql<string | null>`${crawlEntries.raw}->'senses'->0->'examples'->>0`,
    })
    .from(crawlEntries)
    .where(
      // status='parsed' — pending/failed chưa có data dùng được (spec status machine)
      sql`${crawlEntries.status} = 'parsed'
          AND (${crawlEntries.slug} = ANY(${bases}::text[])
          OR ${crawlEntries.slug} ~ ANY(${patterns}::text[])
          OR lower(trim(${crawlEntries.word})) = ANY(${hws}::text[]))`,
    );
}

/**
 * Enrich fill-empty cho words của book (bookId) hoặc theo danh sách id
 * (wordIds — route đã cap 200; DB leg tự chặn +1 → EnrichCapError).
 * dryRun:true → counts theo emptiness HIỆN TẠI, không ghi;
 * apply → UPDATE COALESCE (emptiness apply-time) + source khi ≥1 fill
 * + revalidateContent(), trả report per-word.
 */
export async function enrichWordsDb(args: {
  bookId?: number;
  wordIds?: number[];
  dryRun: boolean;
}): Promise<DryRunCounts | EnrichReportItem[]> {
  const total = args.wordIds?.length ?? 0;
  if (args.bookId === undefined && total > ENRICH_MAX_WORDS) {
    throw new EnrichCapError(total);
  }

  const rows = await resolveWordRows(args);
  if (rows.length > ENRICH_MAX_WORDS) throw new EnrichCapError(rows.length);
  if (rows.length === 0) return args.dryRun ? emptyCounts() : [];

  const candidates = await fetchCandidates(rows.map((r) => r.word));

  const outcomes = rows.map((row) => {
    const picked = matchWord(row.word, candidates);
    // matchWord trả superset MatchCandidate — map lại đầy đủ EnrichEntryData theo id
    const winner = picked === null ? null : candidates.find((c) => c.id === picked.id) ?? null;
    return { row, winner, outcome: buildFill(row, winner) };
  });

  if (args.dryRun) {
    const counts = emptyCounts();
    for (const { winner, outcome } of outcomes) {
      if (winner === null) continue;
      counts.candidates += 1;
      if (outcome.fills.ipa !== undefined) counts.fillableIpa += 1;
      if (outcome.fills.example !== undefined) counts.fillableExample += 1;
      if (outcome.fills.cefr !== undefined) counts.fillableCefr += 1;
      if (outcome.fills.audioUrl !== undefined) counts.fillableAudio += 1;
    }
    return counts;
  }

  const report: EnrichReportItem[] = [];
  for (const { row, winner, outcome } of outcomes) {
    if (winner !== null && outcome.filled.length > 0) {
      // COALESCE mỗi field — emptiness đánh giá lúc APPLY trong SQL (race-safe)
      await db
        .update(words)
        .set({
          ipa: sql`coalesce(${words.ipa}, ${outcome.fills.ipa ?? null})`,
          example: sql`coalesce(${words.example}, ${outcome.fills.example ?? null})`,
          cefr: sql`coalesce(${words.cefr}, ${outcome.fills.cefr ?? null})`,
          audioUrl: sql`coalesce(${words.audioUrl}, ${outcome.fills.audioUrl ?? null})`,
          source: "oxford-ld",
        })
        .where(eq(words.id, row.id));
    }
    report.push({
      word: row.word,
      filled: outcome.filled,
      skipped: outcome.skipped,
      ...(winner === null ? { reason: "noMatch" as const } : outcome.reason !== undefined ? { reason: outcome.reason } : {}),
    });
  }
  revalidateContent();
  return report;
}

function emptyCounts(): DryRunCounts {
  return {
    candidates: 0,
    fillableIpa: 0,
    fillableExample: 0,
    fillableCefr: 0,
    fillableAudio: 0,
  };
}

// ---------------------------------------------------------------------------
// Stats + retry (control-plane reads — DERIVED, KHÔNG bảng crawl_runs: spec cấm)
// ---------------------------------------------------------------------------

export type CrawlStats = {
  counts: {
    pending: number;
    parsed: number;
    failed: number;
    failedMaxAttempts: number;
  };
  /** failed samples (slug + last_error, ≤20) — dashboard debug. */
  samples: { slug: string; lastError: string | null }[];
  /** max(fetched_at) ISO — DERIVED (semantics như store.stats SF-1). */
  lastRun: string | null;
};

const STATS_SAMPLES_MAX = 20;

export async function crawlStatsDb(): Promise<CrawlStats> {
  const byStatus = await db
    .select({
      status: crawlEntries.status,
      n: sql<number>`count(*)`.mapWith(Number),
      maxed: sql<number>`count(*) filter (where ${crawlEntries.attempts} >= ${RETRY_ATTEMPTS_CAP})`.mapWith(Number),
    })
    .from(crawlEntries)
    .groupBy(crawlEntries.status);
  const pick = (status: string) => byStatus.find((r) => r.status === status);
  const samples = await db
    .select({ slug: crawlEntries.slug, lastError: crawlEntries.lastError })
    .from(crawlEntries)
    .where(eq(crawlEntries.status, "failed"))
    .orderBy(asc(crawlEntries.id))
    .limit(STATS_SAMPLES_MAX);
  const [lastRun] = await db
    .select({ max: sql<Date | null>`max(${crawlEntries.fetchedAt})` })
    .from(crawlEntries);
  return {
    counts: {
      pending: pick("pending")?.n ?? 0,
      parsed: pick("parsed")?.n ?? 0,
      failed: pick("failed")?.n ?? 0,
      failedMaxAttempts: pick("failed")?.maxed ?? 0,
    },
    samples,
    lastRun: lastRun?.max ? new Date(lastRun.max).toISOString() : null,
  };
}

/** reset failed→pending với attempts < cap (giữ last_error — store SF-1 semantics). */
export async function retryFailedDb(): Promise<{ reset: number }> {
  const rows = await db
    .update(crawlEntries)
    .set({ status: "pending" })
    .where(
      and(eq(crawlEntries.status, "failed"), lt(crawlEntries.attempts, RETRY_ATTEMPTS_CAP)),
    )
    .returning({ id: crawlEntries.id });
  return { reset: rows.length };
}

export const SITEMAP_DELTA_MAX = 2000;

export type RefreshSitemapResult =
  | { inserted: number }
  | { deltaTooLarge: true; delta: number; hint: string };

/**
 * refresh-sitemap (control): fetchSlugs (SF-1 — network, control-op admin
 * bấm) → diff vs DB → upsert CHỈ slug mới. Delta > ${SITEMAP_DELTA_MAX} →
 * deltaTooLarge + hint runner, KHÔNG upsert cưỡng bức trong request (spec §[api]).
 */
export async function refreshSitemapDb(): Promise<RefreshSitemapResult> {
  const slugs = await fetchSlugs();
  const existingRows = await db.select({ slug: crawlEntries.slug }).from(crawlEntries);
  const existing = new Set(existingRows.map((r) => r.slug));
  const fresh = slugs.filter((s) => !existing.has(s));
  if (fresh.length > SITEMAP_DELTA_MAX) {
    return {
      deltaTooLarge: true,
      delta: fresh.length,
      hint: `delta ${fresh.length} > ${SITEMAP_DELTA_MAX} — chạy runner: node scripts/oxford-crawl.ts enumerate --apply`,
    };
  }
  let inserted = 0;
  for (let i = 0; i < fresh.length; i += UPSERT_BATCH_SIZE) {
    const chunk = fresh.slice(i, i + UPSERT_BATCH_SIZE);
    if (chunk.length === 0) continue;
    const rows = await db
      .insert(crawlEntries)
      .values(chunk.map((slug) => ({ slug })))
      .onConflictDoNothing({ target: crawlEntries.slug })
      .returning({ id: crawlEntries.id });
    inserted += rows.length;
  }
  return { inserted };
}

// ---------------------------------------------------------------------------
// Crawl-on-add preview (cache-first — spec §[api])
// ---------------------------------------------------------------------------

export type PreviewEntry = {
  slug: string;
  word: string;
  ipaUk: string | null;
  ipaUs: string | null;
  cefr: string | null;
  pos: string | null;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
};

export type PreviewResult = {
  found: boolean;
  from: "cache" | "live";
  entry: PreviewEntry | null;
};

function toPreviewEntry(row: EnrichEntryData): PreviewEntry {
  return {
    slug: row.slug,
    word: row.word ?? row.slug,
    ipaUk: row.ipaUk,
    ipaUs: row.ipaUs,
    cefr: row.cefr,
    pos: row.pos,
    audioUkBlob: row.audioUkBlob,
    audioUsBlob: row.audioUsBlob,
  };
}

/**
 * Preview crawl-on-add: cache-first — crawl_entries parsed trúng (winner theo
 * match rule) → KHÔNG gọi Oxford; miss → live fetchEntry + parseEntry (SF-1 —
 * SSRF allowlist 2 host) KHÔNG ghi DB (spec: runner mới ghi).
 * Lỗi mạng/HTTP từ fetchEntry ném ra — route map 502.
 */
export async function previewWordDb(word: string): Promise<PreviewResult> {
  const candidates = await fetchCandidates([word]);
  const picked = matchWord(word, candidates);
  if (picked !== null) {
    const full = candidates.find((c) => c.id === picked.id);
    if (full) {
      return { found: true, from: "cache", entry: toPreviewEntry(full) };
    }
  }
  // live — slug candidate từ word (slug không có space; homograph _N qua regex
  // chỉ match được khi đã cache — live thử đúng 1 slug gốc)
  const result = await fetchEntry(slugBase(word));
  if (result === null) return { found: false, from: "live", entry: null };
  const parsed = parseEntry(result.html);
  if (parsed === null) return { found: false, from: "live", entry: null };
  return {
    found: true,
    from: "live",
    entry: {
      slug: result.finalSlug, // redirect-corrected (tree_1 → tree)
      word: parsed.headword,
      ipaUk: parsed.ipaUk,
      ipaUs: parsed.ipaUs,
      cefr: parsed.cefr,
      pos: parsed.pos,
      audioUkBlob: null, // live chưa tải blob — approve sẽ tải 1 mp3 qua helper
      audioUsBlob: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Seed helper (unit test + SF-3 e2e tái dùng — serial dep nên free)
// ---------------------------------------------------------------------------

export type SeedCrawlEntry = {
  slug: string;
  word?: string | null;
  ipaUk?: string | null;
  ipaUs?: string | null;
  cefr?: string | null;
  pos?: string | null;
  audioUkBlob?: string | null;
  audioUsBlob?: string | null;
  example?: string | null;
  status?: "pending" | "parsed" | "failed";
};

/**
 * Seed 1 crawl_entries row (raw postgres client injectable — test/e2e dùng
 * DB thật; unit test route mock tầng lib nên không cần). ON CONFLICT DO
 * UPDATE — re-seed refresh (raw dựng tối thiểu để derive example sense 1).
 */
export async function seedCrawlEntry(
  sql: SqlClient,
  row: SeedCrawlEntry,
): Promise<{ id: number }> {
  const status = row.status ?? "parsed";
  const raw =
    row.example != null || status === "parsed"
      ? {
          headword: row.word ?? row.slug,
          senses: [{ def: null, examples: row.example != null ? [row.example] : [] }],
          idioms: [],
          phrasalVerbs: [],
        }
      : null;
  const rows = await sql<{ id: number }[]>`
    INSERT INTO crawl_entries (slug, word, ipa_uk, ipa_us, cefr, pos,
                               audio_uk_blob, audio_us_blob, raw, status)
    VALUES (${row.slug}, ${row.word ?? null}, ${row.ipaUk ?? null}, ${row.ipaUs ?? null},
            ${row.cefr ?? null}, ${row.pos ?? null}, ${row.audioUkBlob ?? null},
            ${row.audioUsBlob ?? null}, ${raw === null ? null : sql.json(raw)}, ${status})
    ON CONFLICT (slug) DO UPDATE SET
      word = EXCLUDED.word, ipa_uk = EXCLUDED.ipa_uk, ipa_us = EXCLUDED.ipa_us,
      cefr = EXCLUDED.cefr, pos = EXCLUDED.pos,
      audio_uk_blob = EXCLUDED.audio_uk_blob, audio_us_blob = EXCLUDED.audio_us_blob,
      raw = EXCLUDED.raw, status = EXCLUDED.status
    RETURNING id
  `;
  return { id: rows[0].id };
}

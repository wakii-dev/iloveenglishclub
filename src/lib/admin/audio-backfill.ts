/**
 * Audio backfill DB leg (VU-43 SF-1 task 9) — gán audio_url cho words THIẾU
 * audio (marker tự nhiên: audio_url IS NULL) từ blob Oxford CÓ SẴN trong
 * crawl_entries (copy URL — zero Blob-write); download-blob-thiếu = opt-in
 * allowDownload cap 100. SCOPE BẮT BUỘC ({bookId} | {wordIds}) — chống đụng
 * data thật trên shared-DB (spec §9 rủi ro 9).
 *
 * Match tái dùng export match.ts/enrich.ts (slugBase/slugPatterns/matchWord —
 * KHÔNG đổi behavior, 10 importers VU-32). revalidate ĐÚNG 1 LẦN cuối apply.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookWords, crawlEntries, words } from "@/db/schema";
import { revalidateContent } from "@/lib/revalidate";
import { matchWord, type MatchCandidate } from "@/lib/oxford/match";
import { slugBase, slugPatterns } from "@/lib/oxford/enrich";

export const BACKFILL_APPLY_CAP = 200;
export const BACKFILL_DOWNLOAD_CAP = 100;

export type BackfillScope = { bookId: number } | { wordIds: number[] };

export type BackfillPlan = {
  matched: { wordId: number; blobUrl: string }[];
  /** entry khớp nhưng blob chưa tải (chỉ đếm — spec pin, không liệt kê). */
  pending: number;
  /** word không tìm thấy entry nào khớp. */
  missing: number[];
};

export type BackfillApplyReport = {
  applied: number; // copy blob URL thành công
  downloaded: number; // allowDownload: tải + put blob mới
  errors: { wordId: number; error: string }[];
};

/** Deps injectable (test mock; prod: fetch + storage-server putAudio). */
export type BackfillDeps = {
  download: (url: string) => Promise<Buffer>;
  put: (path: string, data: Buffer, contentType?: string) => Promise<{ url: string }>;
};

/** Scan words thiếu audio trong scope (marker audio_url IS NULL), limit áp söz. */
async function scanWordsWithoutAudio(
  scope: BackfillScope,
  limit: number,
): Promise<{ id: number; word: string }[]> {
  const base = db
    .select({ id: words.id, word: words.word })
    .from(words)
    .$dynamic();
  const scoped =
    "bookId" in scope
      ? base
          .innerJoin(bookWords, eq(bookWords.wordId, words.id))
          .where(
            and(eq(bookWords.bookId, scope.bookId), isNull(words.audioUrl)),
          )
      : base.where(and(inArray(words.id, scope.wordIds), isNull(words.audioUrl)));
  return scoped.orderBy(asc(words.id)).limit(limit);
}

/** Candidate entries cho tập word — 1 query (mirror fetchCandidates enrich.ts,
 *  dùng export slugBase/slugPatterns + matchWord winner). */
async function fetchBackfillCandidates(
  rawWords: string[],
): Promise<(MatchCandidate & {
  audioUkBlob: string | null;
  audioUsBlob: string | null;
  audioUkUrl: string | null;
  audioUsUrl: string | null;
})[]> {
  const hws = [...new Set(rawWords.map((w) => w.trim().toLowerCase()))].filter(Boolean);
  if (hws.length === 0) return [];
  const bases = [...new Set(hws.map(slugBase))];
  const homographRegex = `^(${[
    ...new Set(hws.flatMap((w) => slugPatterns(w).map((p) => p.slice(1, -1)))),
  ].join("|")})$`;
  return db
    .select({
      id: crawlEntries.id,
      slug: crawlEntries.slug,
      word: crawlEntries.word,
      cefr: crawlEntries.cefr,
      audioUkBlob: crawlEntries.audioUkBlob,
      audioUsBlob: crawlEntries.audioUsBlob,
      audioUkUrl: crawlEntries.audioUkUrl,
      audioUsUrl: crawlEntries.audioUsUrl,
    })
    .from(crawlEntries)
    .where(
      and(
        eq(crawlEntries.status, "parsed"),
        or(
          inArray(crawlEntries.slug, bases),
          sql`${crawlEntries.slug} ~ ${homographRegex}`,
          inArray(sql`lower(trim(${crawlEntries.word}))`, hws),
        ),
      ),
    );
}

/**
 * Dry-run plan: matched (copy blob URL), pending (entry có audio url gốc nhưng
 * chưa có blob — chỉ đếm), missing (không entry). Winner per word qua matchWord
 * (headword exact > slug; cefr non-null trước; id nhỏ — deterministic VU-32).
 */
export async function planAudioBackfill(
  scope: BackfillScope,
  limit = BACKFILL_APPLY_CAP,
): Promise<BackfillPlan> {
  const rows = await scanWordsWithoutAudio(scope, limit);
  if (rows.length === 0) return { matched: [], pending: 0, missing: [] };

  const candidates = await fetchBackfillCandidates(rows.map((r) => r.word));
  const plan: BackfillPlan = { matched: [], pending: 0, missing: [] };
  for (const row of rows) {
    const winner = matchWord(row.word, candidates);
    if (winner === null) {
      plan.missing.push(row.id);
      continue;
    }
    const full = candidates.find((c) => c.id === winner.id);
    const blob = full?.audioUkBlob ?? full?.audioUsBlob ?? null;
    if (blob) {
      plan.matched.push({ wordId: row.id, blobUrl: blob });
    } else {
      plan.pending++;
    }
  }
  return plan;
}

/**
 * Apply: copy blob URL (cap 200) vào audio_url — 1 UPDATE … FROM (VALUES) duy
 * nhất; allowDownload:true → tải + put blob cho pending cap 100 qua deps.
 * revalidate ĐÚNG 1 LẦN cuối (contract pin — không trong loop).
 */
export async function applyAudioBackfill(
  scope: BackfillScope,
  options: { limit?: number; allowDownload?: boolean; deps: BackfillDeps },
): Promise<BackfillApplyReport> {
  const limit = Math.min(options.limit ?? BACKFILL_APPLY_CAP, BACKFILL_APPLY_CAP);
  const plan = await planAudioBackfill(scope, limit);
  const report: BackfillApplyReport = { applied: 0, downloaded: 0, errors: [] };

  if (plan.matched.length > 0) {
    await db.execute(
      sql`update ${words} set audio_url = v.url from (values ${sql.join(
        plan.matched.map((m) => sql`(${m.wordId}::int, ${m.blobUrl}::text)`),
        sql`, `,
      )}) as v(id, url) where ${words.id} = v.id`,
    );
    report.applied = plan.matched.length;
  }

  if (options.allowDownload) {
    const rows = await scanWordsWithoutAudio(scope, limit);
    const candidates = await fetchBackfillCandidates(rows.map((r) => r.word));
    let downloaded = 0;
    for (const row of rows) {
      if (downloaded >= BACKFILL_DOWNLOAD_CAP) break;
      const winner = matchWord(row.word, candidates);
      const full = winner ? candidates.find((c) => c.id === winner.id) : undefined;
      const blob = full?.audioUkBlob ?? full?.audioUsBlob ?? null;
      if (blob || !full) continue; // matched đã xử lý ở trên / missing bỏ qua
      const provenance = full.audioUkUrl ?? full.audioUsUrl;
      if (!provenance) continue;
      try {
        const data = await options.deps.download(provenance);
        const ext = provenance.split("?")[0]?.endsWith(".wav") ? "wav" : "mp3";
        const stored = await options.deps.put(
          `audio/vocabulary/${row.id}.${ext}`,
          data,
          ext === "wav" ? "audio/wav" : "audio/mpeg",
        );
        await db
          .update(words)
          .set({ audioUrl: stored.url })
          .where(eq(words.id, row.id));
        downloaded++;
        report.downloaded++;
      } catch (error) {
        report.errors.push({
          wordId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  revalidateContent(); // 1 lần cuối apply — pin
  return report;
}

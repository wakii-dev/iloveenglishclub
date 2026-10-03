import type { OxfordEntry } from "./parse.ts";

/**
 * Store cho crawl_entries (VU-32 SF-1) — SQL client INJECTABLE (postgres.js
 * chuẩn dự án: prepare:false PgBouncer/Neon pooler-safe). KHÔNG import
 * src/db/index.ts (module Next-flow; script CLI tự dựng client — pattern
 * scripts/seed.ts).
 *
 * Status machine 3 trạng thái bền: pending → parsed | failed (fetch+parse
 * nguyên tử — KHÔNG có 'fetched'). Single-runner assumption: KHÔNG lock/claim
 * cạnh tranh — claimPending chỉ SELECT batch theo id; violating = tự chịu
 * (documented spec §Kiến trúc).
 */

export type SqlClient = import("postgres").Sql;

export type PendingRow = { id: number; slug: string; attempts: number };

export type StatsCounts = {
  pending: number;
  parsed: number;
  failed: number;
  /** failed với attempts >= 5 — quá cap retry, dashboard hiển thị riêng. */
  failedMaxAttempts: number;
};

export const RETRY_ATTEMPTS_CAP = 5;
export const UPSERT_BATCH_SIZE = 100;

/** Upsert slugs → status pending. Slug có sẵn GIỮ nguyên trạng thái (không
 *  đụng, không reset); slug mất khỏi sitemap KHÔNG xoá (upsert 1 chiều).
 *  Batch 100 — kill giữa chừng chạy lại vẫn idempotent (ON CONFLICT DO NOTHING). */
export async function upsertSlugs(
  sql: SqlClient,
  slugs: string[],
  batchSize = UPSERT_BATCH_SIZE,
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (let i = 0; i < slugs.length; i += batchSize) {
    const chunk = slugs.slice(i, i + batchSize);
    if (chunk.length === 0) continue;
    const rows = await sql`
      INSERT INTO crawl_entries (slug)
      SELECT * FROM unnest(${chunk}::text[])
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `;
    inserted += rows.length;
  }
  return { inserted };
}

/** Batch pending kế tiếp (single-runner: chỉ SELECT, không claim cạnh tranh). */
export async function claimPending(
  sql: SqlClient,
  limit: number,
): Promise<PendingRow[]> {
  return sql<PendingRow[]>`
    SELECT id, slug, attempts FROM crawl_entries
    WHERE status = 'pending'
    ORDER BY id
    LIMIT ${limit}
  `;
}

export async function findBySlug(
  sql: SqlClient,
  slug: string,
): Promise<{ id: number; slug: string; status: string; audioUkUrl: string | null; audioUsUrl: string | null; audioUkBlob: string | null; audioUsBlob: string | null } | null> {
  const rows = await sql<{
    id: number;
    slug: string;
    status: string;
    audio_uk_url: string | null;
    audio_us_url: string | null;
    audio_uk_blob: string | null;
    audio_us_blob: string | null;
  }[]>`
    SELECT id, slug, status, audio_uk_url, audio_us_url, audio_uk_blob, audio_us_blob
    FROM crawl_entries WHERE slug = ${slug}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    status: r.status,
    audioUkUrl: r.audio_uk_url,
    audioUsUrl: r.audio_us_url,
    audioUkBlob: r.audio_uk_blob,
    audioUsBlob: r.audio_us_blob,
  };
}

/** Fetch+parse thành công — attempts+1, fetched_at, clear last_error. */
export async function markParsed(
  sql: SqlClient,
  id: number,
  entry: OxfordEntry,
): Promise<void> {
  await sql`
    UPDATE crawl_entries SET
      status = 'parsed', word = ${entry.headword},
      raw = ${sql.json(entry)}, ipa_uk = ${entry.ipaUk}, ipa_us = ${entry.ipaUs},
      audio_uk_url = ${entry.audioUkUrl}, audio_us_url = ${entry.audioUsUrl},
      pos = ${entry.pos}, cefr = ${entry.cefr}, ox3000 = ${entry.ox3000},
      attempts = attempts + 1, last_error = NULL, fetched_at = now()
    WHERE id = ${id}
  `;
}

/** Fetch lỗi HOẶC 200 không headword — attempts+1, last_error giữ để debug. */
export async function markFailed(
  sql: SqlClient,
  id: number,
  error: string,
): Promise<void> {
  await sql`
    UPDATE crawl_entries SET
      status = 'failed', last_error = ${error.slice(0, 500)},
      attempts = attempts + 1, fetched_at = now()
    WHERE id = ${id}
  `;
}

/** stats counts theo status — dashboard (SF-2 API đọc, SF-3 render). */
export async function stats(sql: SqlClient): Promise<StatsCounts> {
  const rows = await sql<{ status: string; n: number; maxed: number }[]>`
    SELECT status, count(*)::int AS n,
           count(*) FILTER (WHERE attempts >= ${RETRY_ATTEMPTS_CAP})::int AS maxed
    FROM crawl_entries GROUP BY status
  `;
  const by = new Map(rows.map((r) => [r.status, r]));
  const pick = (status: string): number => by.get(status)?.n ?? 0;
  return {
    pending: pick("pending"),
    parsed: pick("parsed"),
    failed: pick("failed"),
    failedMaxAttempts: by.get("failed")?.maxed ?? 0,
  };
}

/** reset failed→pending với attempts < cap (giữ last_error để debug); quá cap ở lại failed. */
export async function retryFailed(sql: SqlClient): Promise<number> {
  const rows = await sql`
    UPDATE crawl_entries SET status = 'pending'
    WHERE status = 'failed' AND attempts < ${RETRY_ATTEMPTS_CAP}
    RETURNING id
  `;
  return rows.length;
}

/** Ghi URL Blob sau khi tải audio (phase audio — deps.put blob-only ở caller). */
export async function saveAudioBlob(
  sql: SqlClient,
  id: number,
  variant: "uk" | "us",
  blobUrl: string,
): Promise<void> {
  if (variant === "uk") {
    await sql`UPDATE crawl_entries SET audio_uk_blob = ${blobUrl} WHERE id = ${id}`;
  } else {
    await sql`UPDATE crawl_entries SET audio_us_blob = ${blobUrl} WHERE id = ${id}`;
  }
}

export type AudioPendingRow = {
  id: number;
  slug: string;
  audioUkUrl: string | null;
  audioUsUrl: string | null;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
};

/** Entries parsed còn thiếu blob (≥1 variant có URL nhưng chưa tải) — phase audio. */
export async function claimAudioPending(
  sql: SqlClient,
  limit: number,
): Promise<AudioPendingRow[]> {
  const rows = await sql<{
    id: number;
    slug: string;
    audio_uk_url: string | null;
    audio_us_url: string | null;
    audio_uk_blob: string | null;
    audio_us_blob: string | null;
  }[]>`
    SELECT id, slug, audio_uk_url, audio_us_url, audio_uk_blob, audio_us_blob
    FROM crawl_entries
    WHERE status = 'parsed'
      AND (
        (audio_uk_url IS NOT NULL AND audio_uk_blob IS NULL)
        OR (audio_us_url IS NOT NULL AND audio_us_blob IS NULL)
      )
    ORDER BY id
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    audioUkUrl: r.audio_uk_url,
    audioUsUrl: r.audio_us_url,
    audioUkBlob: r.audio_uk_blob,
    audioUsBlob: r.audio_us_blob,
  }));
}

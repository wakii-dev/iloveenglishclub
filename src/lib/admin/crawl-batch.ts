/**
 * Pure helpers crawl admin UI (VU-32 SF-3) — enrich panel loop batch
 * (context pack §3: book >200 từ → continue-and-collect — chunk lỗi ghi
 * report, KHÔNG dừng loop; API cap 200 từ/request — spec §[api]) + dashboard
 * timestamp. KHÔNG import db/next — unit test trực tiếp (tách lớp như
 * vocabulary.ts).
 */
import type { DryRunCounts } from "@/lib/oxford/enrich";

export const ENRICH_CHUNK = 200;

/** Chia ids thành chunk ≤ cap — chunk cuối < cap. cap <= 0 → throw sớm. */
export function chunkIds<T>(ids: T[], cap: number): T[][] {
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new RangeError(`chunk cap phải nguyên dương, nhận ${cap}`);
  }
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += cap) {
    chunks.push(ids.slice(i, i + cap));
  }
  return chunks;
}

export function emptyCounts(): DryRunCounts {
  return {
    candidates: 0,
    fillableIpa: 0,
    fillableExample: 0,
    fillableCefr: 0,
    fillableAudio: 0,
  };
}

/** Gộp counts dry-run của các chunk (panel preview book >200 từ). */
export function sumDryRunCounts(counts: DryRunCounts[]): DryRunCounts {
  const total = emptyCounts();
  for (const c of counts) {
    total.candidates += c.candidates;
    total.fillableIpa += c.fillableIpa;
    total.fillableExample += c.fillableExample;
    total.fillableCefr += c.fillableCefr;
    total.fillableAudio += c.fillableAudio;
  }
  return total;
}

export type ChunkFailure = { index: number; message: string };

/**
 * Chạy chunks TUẦN TỰ; chunk throw → ghi failed + gọi onError (nếu có —
 * giá trị trả về vẫn vào results) → TIẾP TỤC chunk kế (continue-and-collect,
 * không dừng loop). results giữ thứ tự chunk thành công.
 */
export async function runChunked<T, R>(
  ids: T[],
  cap: number,
  fn: (chunk: T[], index: number) => Promise<R>,
  onError?: (index: number, error: unknown) => R | undefined,
): Promise<{ results: R[]; failed: ChunkFailure[] }> {
  const results: R[] = [];
  const failed: ChunkFailure[] = [];
  const chunks = chunkIds(ids, cap);
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index]!;
    try {
      results.push(await fn(chunk, index));
    } catch (error) {
      failed.push({
        index,
        message: error instanceof Error ? error.message : String(error),
      });
      const salvaged = onError?.(index, error);
      if (salvaged !== undefined) results.push(salvaged);
    }
  }
  return { results, failed };
}

/** ISO → "dd/MM/yyyy HH:mm" theo locale; null → null (chưa crawl lần nào). */
export function formatCrawlTimestamp(
  iso: string | null,
  locale = "vi-VN",
  timeZone?: string,
): string | null {
  if (iso === null) return null;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone !== undefined ? { timeZone } : {}),
  }).format(new Date(iso));
}

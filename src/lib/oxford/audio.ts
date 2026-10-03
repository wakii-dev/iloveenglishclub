/**
 * Audio leg (VU-32 SF-1): mp3 Oxford → Vercel Blob `audio/oxford/` — QUA
 * HELPER BLOB-ONLY (deps.put — caller inject putBlobAudio; helper THROW khi
 * thiếu BLOB_READ_WRITE_TOKEN, propagation KHÔNG nuốt — thiếu token KHÔNG
 * silent local path). Resumable/idempotent: variant đã có blob → skip;
 * addRandomSuffix:false → re-run ghi đè cùng path.
 *
 * Chỉ tải từ media host (allowlist Oxford) — provenance URL mp3 gốc nằm ở
 * audio_uk_url/audio_us_url (fetch+parse lưu trước).
 */
import { ENTRY_HOST_SUFFIX, SizeCapError } from "./fetch.ts";

export const AUDIO_OXFORD_PREFIX = "audio/oxford/";
export const DEFAULT_AUDIO_MAX_BYTES = 2 * 1024 * 1024;

export type AudioVariant = "uk" | "us";

export function oxfordAudioPath(slug: string, variant: AudioVariant): string {
  if (!slug || /[\\/]/.test(slug)) {
    throw new Error(`oxfordAudioPath: slug không hợp lệ: "${slug}"`);
  }
  return `${AUDIO_OXFORD_PREFIX}${slug}.${variant}.mp3`;
}

/** URL mp3 phải nằm trên host Oxford (media cùng domain) — chống SSRF. */
export function isAllowedAudioUrl(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  return hostname === ENTRY_HOST_SUFFIX.slice(1) || hostname.endsWith(ENTRY_HOST_SUFFIX);
}

export type DownloadMp3Deps = {
  fetchImpl?: typeof fetch;
  maxBytes?: number;
};

export async function downloadMp3(
  url: string,
  deps: DownloadMp3Deps = {},
): Promise<Buffer> {
  if (!isAllowedAudioUrl(url)) {
    throw new Error(`downloadMp3: host không thuộc allowlist Oxford — ${url}`);
  }
  const maxBytes = deps.maxBytes ?? DEFAULT_AUDIO_MAX_BYTES;
  const res = await (deps.fetchImpl ?? fetch)(url, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`downloadMp3: HTTP ${res.status} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) {
    throw new SizeCapError(maxBytes, url);
  }
  return buf;
}

export type EntryForAudio = {
  id: number;
  slug: string;
  audioUkUrl: string | null;
  audioUsUrl: string | null;
  audioUkBlob: string | null;
  audioUsBlob: string | null;
};

export type AudioDeps = {
  fetchImpl?: typeof fetch;
  /** BẮT BUỘC inject — default putBlobAudio (blob-only, throw khi thiếu token). */
  put: (path: string, data: Buffer, contentType?: string) => Promise<string>;
  save: (id: number, variant: AudioVariant, blobUrl: string) => Promise<void>;
};

export type SyncEntryAudioResult = { uploaded: number; skipped: number };

/** Tải + ghi blob variants còn thiếu của 1 entry; URL null → skip; đã có blob → skip. */
export async function syncEntryAudio(
  entry: EntryForAudio,
  deps: AudioDeps,
): Promise<SyncEntryAudioResult> {
  let uploaded = 0;
  let skipped = 0;
  for (const variant of ["uk", "us"] as const) {
    const url = variant === "uk" ? entry.audioUkUrl : entry.audioUsUrl;
    const existing = variant === "uk" ? entry.audioUkBlob : entry.audioUsBlob;
    if (!url) {
      skipped += 1; // entry không có variant này (US-only…) — bình thường
      continue;
    }
    if (existing) {
      skipped += 1; // resumable — re-run không dup
      continue;
    }
    const mp3 = await downloadMp3(url, deps);
    const blobUrl = await deps.put(oxfordAudioPath(entry.slug, variant), mp3);
    await deps.save(entry.id, variant, blobUrl);
    uploaded += 1;
  }
  return { uploaded, skipped };
}

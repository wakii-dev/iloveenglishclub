/**
 * Audio mirror Blob → Git (scripts/audio-sync.ts dùng): quyết định file nào
 * cần tải từ Vercel Blob store về `public/audio/` để commit — backup + serve
 * tĩnh từ build (seeded rows với path tương đối playback qua static; uploaded
 * rows playback qua CDN URL — mirror KHÔNG đổi behavior playback).
 *
 * Pure fn — script giữ phần IO (list/download/git). So sánh theo SIZE (list()
 * trả size sẵn): thiếu file hoặc khác size → tải (upload admin replace ghi
 * đè cùng path nên size đổi khi nội dung đổi). File local thừa (không có
 * trên store) → giữ nguyên (fixtures trong repo không bị xoá).
 */

/** Prefix duy nhất script xử lý — store có thể chứa key khác (rác test...). */
export const AUDIO_PREFIX = "audio/";

/**
 * Prefix KHÔNG mirror git (VU-32 SF-1): `audio/oxford/` là dictionary archive
 * (~128k mp3 ≈ 4-6GB) — backup git vô nghĩa + bloat repo. Runner crawl ghi
 * trực tiếp Blob; audio-sync loại hẳn khỏi plan (không toDownload, không
 * unchanged). Phải có TRƯỚC khi audio Oxford đầu tiên được tải.
 */
export const AUDIO_SYNC_EXCLUDED_PREFIXES = ["audio/oxford/"];

export type BlobEntry = { pathname: string; size: number };

export type SyncPlan = {
  /** File cần tải về public/audio/ (thiếu ở local hoặc khác size). */
  toDownload: BlobEntry[];
  /** File đã khớp (cùng path + size) — bỏ qua. */
  unchanged: number;
};

export function planSync(
  listed: BlobEntry[],
  localSizes: Record<string, number>,
): SyncPlan {
  const toDownload: BlobEntry[] = [];
  let unchanged = 0;
  for (const entry of listed) {
    if (!entry.pathname.startsWith(AUDIO_PREFIX)) continue;
    if (AUDIO_SYNC_EXCLUDED_PREFIXES.some((p) => entry.pathname.startsWith(p)))
      continue;
    if (localSizes[entry.pathname] === entry.size) {
      unchanged += 1;
    } else {
      toDownload.push(entry);
    }
  }
  return { toDownload, unchanged };
}

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
    if (localSizes[entry.pathname] === entry.size) {
      unchanged += 1;
    } else {
      toDownload.push(entry);
    }
  }
  return { toDownload, unchanged };
}

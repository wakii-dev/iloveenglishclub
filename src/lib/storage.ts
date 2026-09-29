/**
 * Storage abstraction — PHẦN CLIENT-SAFE (spec §3): pure URL/path helpers,
 * không import @vercel/blob (dùng node:fs/promises → webpack client bundle
 * chết UnhandledSchemeError nếu bị kéo vào — bug deploy 2026-09-29).
 *
 * - driver `local`: playback qua /public — dev only (Vercel prod read-only FS).
 * - driver `blob`: Vercel Blob CDN — prod khi có BLOB_READ_WRITE_TOKEN.
 *
 * Các hàm GHI/XÓA (putAudio/deleteAudio — server-only, import @vercel/blob)
 * nằm ở `lib/storage-server.ts` — chỉ import trong Server Components/Route
 * Handlers/Actions. Client chỉ được dùng 3 hàm dưới đây.
 */

export type StorageDriver = "local" | "blob";

export function storageDriver(): StorageDriver {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
}

/** Path key theo layout spec §3: audio/{book}/{unit}/{lesson}/{NN}.mp3 (NN zero-pad 2). */
export function buildAudioPath(parts: {
  book: string;
  unit: string;
  lesson: string;
  index: number;
}): string {
  const nn = String(parts.index).padStart(2, "0");
  return `audio/${parts.book}/${parts.unit}/${parts.lesson}/${nn}.mp3`;
}

/** URL playback theo driver hiện hành (blob driver: path đã là URL đầy đủ từ putAudio). */
export function resolveAudioUrl(path: string): string {
  return storageDriver() === "blob" ? path : `/${path}`;
}

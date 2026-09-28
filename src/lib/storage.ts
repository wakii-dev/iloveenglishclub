import { del, put } from "@vercel/blob";

/**
 * Storage abstraction mỏng (spec §3 — sẵn sàng swap driver mà SF-5 không đổi code):
 * - driver `local`: ghi vào public/uploads/ — Next dev server serve tĩnh.
 *   ⚠ CHỈ dev: Vercel prod read-only FS + public/ đóng băng lúc build.
 * - driver `blob`: Vercel Blob (CDN URL) — prod khi có BLOB_READ_WRITE_TOKEN.
 *
 * DB (SF-2) lưu path key tương đối dạng `audio/{book}/{unit}/{lesson}/{NN}.mp3`
 * (spec §3 layout); URL playback resolve qua resolveAudioUrl() theo driver.
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

export async function putAudio(
  path: string,
  data: Buffer,
  contentType = "audio/mpeg",
): Promise<{ path: string; url: string }> {
  if (storageDriver() === "blob") {
    const blob = await put(path, data, {
      contentType,
      access: "public",
      addRandomSuffix: false,
    });
    return { path, url: blob.url };
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const filePath = `${process.cwd()}/public/${path}`;
  await mkdir(filePath.slice(0, filePath.lastIndexOf("/")), {
    recursive: true,
  });
  await writeFile(filePath, data);
  return { path, url: `/${path}` };
}

export async function deleteAudio(path: string): Promise<void> {
  if (storageDriver() === "blob") {
    await del(path);
    return;
  }
  const { rm } = await import("node:fs/promises");
  await rm(`${process.cwd()}/public/${path}`, { force: true });
}

/** URL playback theo driver hiện hành (blob driver: path đã là URL đầy đủ từ putAudio). */
export function resolveAudioUrl(path: string): string {
  return storageDriver() === "blob" ? path : `/${path}`;
}

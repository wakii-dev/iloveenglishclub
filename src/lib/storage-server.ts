import "server-only";
import { del, put } from "@vercel/blob";

/**
 * Storage — PHẦN SERVER-ONLY (ghi/xóa audio). Tách khỏi `lib/storage.ts`
 * (client-safe) để client bundle không kéo @vercel/blob → node:fs/promises
 * (webpack UnhandledSchemeError — bug deploy 2026-09-29).
 *
 * - driver `local`: ghi vào public/uploads/ — Next dev server serve tĩnh.
 *   ⚠ CHỈ dev: Vercel prod read-only FS + public/ đóng băng lúc build.
 * - driver `blob`: Vercel Blob (CDN URL) — prod khi có BLOB_READ_WRITE_TOKEN.
 *
 * DB `lessonParts.audioPath` lưu giá trị playback-able (persistedAudioPath):
 * local → path key `audio/{book}/{unit}/{lesson}/{NN}.mp3`, blob → URL CDN
 * đầy đủ. Playback resolve qua resolveAudioUrl() (client-safe) theo driver.
 */

export async function putAudio(
  path: string,
  data: Buffer,
  contentType = "audio/mpeg",
): Promise<{ path: string; url: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && process.env.VERCEL) {
    // Fail fast với lỗi rõ ràng — KHÔNG fallback FS (bug prod 2026-09-30:
    // thiếu token → mkdir /var/task/public/... → ENOENT 500 im lặng).
    throw new Error(
      "putAudio: BLOB_READ_WRITE_TOKEN missing on Vercel — connect a Blob store (vercel storage connect)",
    );
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
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
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await del(path);
    return;
  }
  const { rm } = await import("node:fs/promises");
  await rm(`${process.cwd()}/public/${path}`, { force: true });
}

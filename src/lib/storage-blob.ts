import { put } from "@vercel/blob";

/**
 * Helper ghi Blob BLOB-ONLY (VU-32 SF-1 — P0 plan-critic): audio Oxford chỉ
 * được ghi lên Vercel Blob. Khác `putAudio` (storage-server.ts có fallback
 * `public/` cho dev), helper này THROW khi thiếu BLOB_READ_WRITE_TOKEN —
 * fallback local path leak vào prod là lỗi P0 (bug 2026-09-30: silent
 * ENOENT; silent `audio/oxford/...` local path vô nghĩa trên prod).
 *
 * Tách file khỏi storage-server.ts: file đó có `import "server-only"` —
 * package không resolve được ngoài Next (vitest + node24 CLI chết lúc load).
 * Guard throw-token ở đây tự thân là rào chắn P0; KHÔNG tự thêm fallback FS.
 *
 * Token nguồn: `.env.local` qua `vercel env pull --environment development`
 * (cùng convention scripts/audio-sync.ts).
 */
export async function putBlobAudio(
  path: string,
  data: Buffer,
  contentType = "audio/mpeg",
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      `putBlobAudio: BLOB_READ_WRITE_TOKEN thiếu — audio Oxford chỉ ghi được lên Blob. ` +
        `Chạy \`vercel env pull --environment development\` rồi thử lại ` +
        `(KHÔNG có fallback local — path public/ vô nghĩa trên prod).`,
    );
  }
  // addRandomSuffix:false → re-run cùng path ghi đè = idempotent (resume không dup).
  const blob = await put(path, data, {
    contentType,
    access: "public",
    addRandomSuffix: false,
  });
  return blob.url;
}

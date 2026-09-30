/**
 * Audio mapping pure fns (SF-5 — spec §6.3): parse số đầu tên file, sort
 * NUMERIC (lexicographic sai: "10.mp3" < "2.mp3"), mime → extension theo
 * path convention `audio/{book}/unit-{n}/lesson-{n}/{NN}.{ext}`.
 */

/** "01.mp3"→1 · "1 - hello.mp3"→1 · "intro.mp3"→null · "0.mp3"→null (không part 0). */
export function parseFileNameIndex(fileName: string): number | null {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const m = /^(\d+)/.exec(base);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export type IndexedFile<T> = { file: T; index: number | null; name: string };

/**
 * Sort theo index tăng dần — STABLE (file trùng số giữ thứ tự input; UI cảnh
 * báo "file sau sẽ thay file trước"). File không có số → cuối danh sách.
 */
export function numericFileSort<T extends IndexedFile<unknown>>(files: T[]): T[] {
  return files.toSorted((a, b) => {
    if (a.index === null && b.index === null) return 0;
    if (a.index === null) return 1;
    if (b.index === null) return -1;
    return a.index - b.index;
  });
}

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

/** Mime trong danh sách chấp nhận → extension; lạ → null (per-file error). */
export function mimeToAudioExt(mime: string): string | null {
  return AUDIO_EXT_BY_MIME[mime.toLowerCase()] ?? null;
}

/** Cap 4MB — Vercel serverless Route Handler body limit ~4.5MB (spec §3). */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Giá trị lưu DB `lessonParts.audioPath` theo driver (bug prod 2026-09-30:
 * route lưu path tương đối cả khi blob → playback 404 vì resolveAudioUrl
 * blob-driver pass-through kỳ vọng URL CDN đầy đủ — storage.test §blob).
 * - blob: URL CDN đầy đủ trả về từ putAudio.
 * - local (dev): path key tương đối, playback resolve `/` + path.
 */
export function persistedAudioPath(
  driver: "local" | "blob",
  put: { path: string; url: string },
): string {
  return driver === "blob" ? put.url : put.path;
}

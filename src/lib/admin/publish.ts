/**
 * Publish gate validator (SF-5 — spec §4, epic §6): publish CHỈ khi mọi part
 * có text non-empty + audio. duration_ms nullable OK. Pure fn — unit test
 * 100% nhánh; publishLessonAction dùng kết quả chặn + trả missing[] cho UI.
 */
export type PublishCheckPart = {
  sortOrder: number;
  text: string;
  audioPath: string | null;
};

export type PublishCheck = {
  ok: boolean;
  /** sortOrder các part thiếu text hoặc audio (để UI liệt kê rõ) */
  missing: number[];
};

export function validatePublish(parts: PublishCheckPart[]): PublishCheck {
  if (parts.length === 0) return { ok: false, missing: [0] };
  const missing = parts
    .filter((p) => !p.text.trim() || p.audioPath === null)
    .map((p) => p.sortOrder);
  return { ok: missing.length === 0, missing };
}

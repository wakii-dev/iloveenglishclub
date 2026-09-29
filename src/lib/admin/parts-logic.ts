/**
 * Parts pure logic (SF-5) — tách khỏi server actions để unit test 100% nhánh.
 *
 * QA-303 (SF-4 2026-09-30): KHÔNG truncate nữa — trả TOÀN BỘ câu đã clean.
 * Bản cũ slice còn lại 200 + trả `dropped` mà addPartsFromScriptAction hủy
 * cấu trúc → paste 300 câu bị chèn 200 câu IM LẶNG (data loss + toast đếm
 * sai). Chặn >200 là việc của guard `tooManySentences` trong action (trước
 * đây dead-branch vì sanitize cắt trước) — admin thấy lỗi rõ, tự chia lô.
 * Cap 200/batch vẫn giữ (chống paste khổng lồ; 1 bài dictation vài chục câu)
 * và giữ lesson < 1000 parts cho shift bump-offset +1000 an toàn.
 */
export const MAX_SENTENCES_PER_BATCH = 200;

export function sanitizeSentences(raw: string[]): {
  sentences: string[];
} {
  return {
    sentences: raw
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  };
}

/**
 * Chia script thành mảng câu theo `.?!` (spec §6 — naive ĐÚNG spec).
 *
 * Câu kết thúc tại HẾT một chuỗi dấu kết liền nhau (run): "What?!" nguyên 1
 * câu; dấu câu ĐÍNH vào câu trả về (strict mode so khớp cần dấu câu).
 *
 * KNOWN-LIMITATION (behavior CHẤP NHẬN theo spec §6 — KHÔNG xử lý viết tắt):
 * viết tắt "Mr."/"e.g.", số thập phân "3.5", ellipsis "..." tách sai —
 * UI admin (SF-5) hiển thị limitation + cho sửa tay từng dòng.
 *
 * Không dùng regex lookbehind (ES2018 — target ES2017 + TS5.5 regex-check):
 * scan thủ công, O(n).
 */

const isDelim = (ch: string): boolean => ch === "." || ch === "?" || ch === "!";

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (isDelim(text[i]!)) {
      let j = i + 1;
      while (j < text.length && isDelim(text[j]!)) j++;
      // Đoạn luôn kết bằng run dấu (non-whitespace) → trim xong không rỗng.
      out.push(text.slice(start, j).trim());
      start = j;
      i = j;
    } else {
      i++;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

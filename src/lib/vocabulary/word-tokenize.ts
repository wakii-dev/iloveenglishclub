/**
 * Token hoá text an toàn cho click-word lookup (SF-5 t-5.2) — PURE. Nội dung
 * sách (lesson_parts.text) là PLAIN TEXT → split theo cụm chữ/số, giữ nguyên
 * mọi dấu câu/khoảng trắng để render không lệch bản gốc. Giới hạn: KHÔNG áp
 * dụng cho HTML phức tạp — component gọi chỉ dùng cho text thuần.
 */
export type TextToken =
  | { kind: "word"; text: string }
  | { kind: "sep"; text: string };

const WORD_RE = /[\p{L}\p{N}'’-]+/gu;

export function tokenizeWords(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let last = 0;
  for (const match of text.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > last) tokens.push({ kind: "sep", text: text.slice(last, start) });
    tokens.push({ kind: "word", text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: "sep", text: text.slice(last) });
  return tokens;
}

/** Token → từ tra: bỏ dấu nối đuôi/đầu ("dogs’" → "dogs") + trim + lowercase. */
export function normalizeLookupToken(token: string): string {
  return token
    .replace(/^['’-]+/, "")
    .replace(/['’-]+$/, "")
    .trim()
    .toLowerCase();
}

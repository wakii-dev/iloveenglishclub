/**
 * Vocabulary validate + bulk-import parsing (SF-1 t-1.2) — PURE, không db/next
 * (unit test trực tiếp, cùng tách lớp parts-logic.ts / audio-mapping.ts).
 * Route giữ phần DB (vocabulary-store.ts) + auth (assertAdmin ở route).
 */

export const WORD_MAX = 100;
export const MEANING_MAX = 500;
export const IPA_MAX = 100;
export const EXAMPLE_MAX = 1000;
export const AUDIO_URL_MAX = 1000;

/** Field word input — snake_case khớp cột DB (body import/API dùng y nguyên). */
export type WordInput = {
  word: string;
  ipa: string | null;
  meaning_vi: string;
  example: string | null;
  audio_url: string | null;
};

/** 1 dòng hợp lệ sau validate — line để report lỗi theo dòng (t-1.2). */
export type ParsedWordRow = WordInput & { line: number };

export type RowError = { line: number; word: string; error: string };

/** Optional field: trim → null khi rỗng; cắt ở max (không phải field unique). */
export function optionalField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

/**
 * Validate 1 word input → WordInput | mã lỗi. word + meaning_vi bắt buộc;
 * audio_url nếu có phải URL http(s) (blob CDN hoặc external). Ngưỡng length
 * chặn payload abuse — cắt ở max đã xử lý ở bounded, đây chỉ check word
 * (trường định danh unique) vì cắt làm hỏng tra từ (SF-5 match theo word).
 */
export function validateWordInput(
  raw: Record<string, unknown>,
): WordInput | { error: string } {
  const word = typeof raw.word === "string" ? raw.word.trim() : "";
  if (!word) return { error: "wordRequired" };
  if (word.length > WORD_MAX || /[\r\n]/.test(word)) return { error: "wordTooLong" };

  const meaning = typeof raw.meaning_vi === "string" ? raw.meaning_vi.trim() : "";
  if (!meaning) return { error: "meaningRequired" };
  if (meaning.length > MEANING_MAX) return { error: "meaningTooLong" };

  const audio = optionalField(raw.audio_url, AUDIO_URL_MAX);
  if (audio !== null && !/^https?:\/\//.test(audio)) return { error: "invalidAudioUrl" };

  return {
    word,
    meaning_vi: meaning,
    ipa: optionalField(raw.ipa, IPA_MAX),
    example: optionalField(raw.example, EXAMPLE_MAX),
    audio_url: audio,
  };
}

/** Parse header CSV → index cột; thiếu word/meaning_vi → null (file-level lỗi). */
function csvHeaderMap(header: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  header.forEach((name, i) => {
    map[name.trim().toLowerCase()] = i;
  });
  if (map.word === undefined || map.meaning_vi === undefined) return null;
  return map;
}

/**
 * CSV RFC4180 thuần (quote "", dấu phẩy/newline trong quote) — KHÔNG thêm
 * dependency (spec import file nhỏ, teacher-driven). Trả { rows, errors }:
 * lỗi từng dòng (thiếu bắt buộc / quá dài) KHÔNG chặn dòng khác. line = số
 * dòng vật lý trong file (header là dòng 1) — report khớp editor teacher.
 */
export function parseVocabularyCsv(content: string): {
  rows: ParsedWordRow[];
  errors: RowError[];
} {
  const rows: ParsedWordRow[] = [];
  const errors: RowError[] = [];

  const cells: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      row.push(cell);
      cells.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    cells.push(row);
  }
  if (!inQuotes && cells.length > 0 && cells[cells.length - 1].length === 1 && cells[cells.length - 1][0] === "") {
    cells.pop(); // trailing newline → không tạo dòng rỗng
  }
  if (inQuotes) return { rows: [], errors: [{ line: 0, word: "", error: "badCsv" }] };

  const header = cells.shift() ?? [];
  const map = csvHeaderMap(header);
  if (!map) return { rows: [], errors: [{ line: 1, word: "", error: "badCsvHeader" }] };

  cells.forEach((cols, idx) => {
    const line = idx + 2; // header là dòng 1
    if (cols.length === 1 && cols[0].trim() === "") return; // dòng trống bỏ qua
    const pick = (key: string) => (map[key] === undefined ? "" : (cols[map[key]] ?? ""));
    const validated = validateWordInput({
      word: pick("word"),
      meaning_vi: pick("meaning_vi"),
      ipa: pick("ipa"),
      example: pick("example"),
      audio_url: pick("audio_url"),
    });
    if ("error" in validated) {
      errors.push({ line, word: pick("word").trim(), error: validated.error });
    } else {
      rows.push({ ...validated, line });
    }
  });
  return { rows, errors };
}

/**
 * JSON import: array of {word, meaning_vi, ipa?, example?, audio_url?} —
 * chấp nhận meaningVi camelCase (nhiều tool export camel). File không phải
 * array/object phần tử → file-level lỗi; lỗi từng phần tử → report line
 * = index + 1.
 */
export function parseVocabularyJson(content: string): {
  rows: ParsedWordRow[];
  errors: RowError[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], errors: [{ line: 0, word: "", error: "badJson" }] };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], errors: [{ line: 0, word: "", error: "badJson" }] };
  }

  const rows: ParsedWordRow[] = [];
  const errors: RowError[] = [];
  parsed.forEach((item, idx) => {
    const line = idx + 1;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      errors.push({ line, word: "", error: "invalidRow" });
      return;
    }
    const raw = item as Record<string, unknown>;
    const validated = validateWordInput({
      word: raw.word,
      meaning_vi: raw.meaning_vi ?? raw.meaningVi,
      ipa: raw.ipa,
      example: raw.example,
      audio_url: raw.audio_url ?? raw.audioUrl,
    });
    if ("error" in validated) {
      errors.push({
        line,
        word: typeof raw.word === "string" ? raw.word.trim() : "",
        error: validated.error,
      });
    } else {
      rows.push({ ...validated, line });
    }
  });
  return { rows, errors };
}

/**
 * Dedupe trong file: word trùng (sau trim, so khớp UNIQUE words.word — case-
 * sensitive như DB) → dòng sau báo "duplicate", dòng đầu giữ. Cả errors từ
 * parser lẫn dedupe gộp chung report, sắp theo line.
 */
export function planImport(
  rows: ParsedWordRow[],
  errors: RowError[],
): { rows: ParsedWordRow[]; errors: RowError[] } {
  const seen = new Set<string>();
  const kept: ParsedWordRow[] = [];
  const dupErrors: RowError[] = [];
  for (const row of rows) {
    if (seen.has(row.word)) {
      dupErrors.push({ line: row.line, word: row.word, error: "duplicate" });
    } else {
      seen.add(row.word);
      kept.push(row);
    }
  }
  return {
    rows: kept,
    errors: [...errors, ...dupErrors].sort((a, b) => a.line - b.line),
  };
}

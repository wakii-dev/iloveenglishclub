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

// Vocab CMS (VU-43 SF-1) — giới hạn field mới (spec §4: pin validate ở 1 chỗ)
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export const POS_MAX = 32;
export const SYNONYMS_MAX = 500;
export const IMAGE_URL_MAX = 1000;

/** Chuẩn hoá so khớp/ghi CEFR: trim + uppercase — 'b1 ' ≡ 'B1'. */
export function normalizeCefr(value: string): string {
  return value.trim().toUpperCase();
}

export function isCefrLevel(value: string): value is CefrLevel {
  return (CEFR_LEVELS as readonly string[]).includes(value);
}

/**
 * cefr input (GHI): trim+upper; rỗng → null (optional); lệch allowlist
 * A1..C2 sau normalize → invalidCefr. Non-string → null (pattern optionalField).
 */
export function validateCefrInput(
  value: unknown,
): CefrLevel | null | { error: "invalidCefr" } {
  if (typeof value !== "string") return null;
  const normalized = normalizeCefr(value);
  if (normalized.length === 0) return null;
  if (!isCefrLevel(normalized)) return { error: "invalidCefr" };
  return normalized;
}

/**
 * pos input (GHI): free text ≤ 32, lowercase-trim; rỗng → null.
 * Nguồn crawl_entries.pos ('noun'…) nhưng teacher có thể sửa tay.
 */
export function validatePosInput(
  value: unknown,
): string | null | { error: "invalidPos" } {
  if (typeof value !== "string") return null;
  const pos = value.trim().toLowerCase();
  if (pos.length === 0) return null;
  if (pos.length > POS_MAX) return { error: "invalidPos" };
  return pos;
}

/** Chuẩn hoá GHI synonyms: split ',' → trim từng item → bỏ rỗng → join ', '. */
export function normalizeSynonyms(value: string): string {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join(", ");
}

/** synonyms input (GHI): chuẩn hoá xong ≤ 500 ký tự — vượt → invalidSynonyms. */
export function validateSynonymsInput(
  value: unknown,
): string | null | { error: "invalidSynonyms" } {
  if (typeof value !== "string") return null;
  const normalized = normalizeSynonyms(value);
  if (normalized.length === 0) return null;
  if (normalized.length > SYNONYMS_MAX) return { error: "invalidSynonyms" };
  return normalized;
}

/** imageUrl input (GHI): URL http(s) như audio_url (blob CDN hoặc external). */
export function validateImageUrlInput(
  value: unknown,
): string | null | { error: "invalidImageUrl" } {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (url.length === 0) return null;
  if (url.length > IMAGE_URL_MAX || !/^https?:\/\//.test(url)) {
    return { error: "invalidImageUrl" };
  }
  return url;
}

/**
 * source input (PATCH — giá trị duy nhất admin được sửa tay: 2 giá trị chuẩn
 * spec §4; promote/enrich tự ghi 'oxford-ld'). 'teacher' ≡ null (mapping
 * filter §4) — giá trị lạ → invalidSource.
 */
export function validateSourceInput(
  value: unknown,
): "oxford-ld" | null | { error: "invalidSource" } {
  if (value === null) return null;
  if (typeof value !== "string") return { error: "invalidSource" };
  const source = value.trim();
  if (source.length === 0 || source === "teacher") return null;
  if (source === "oxford-ld") return "oxford-ld";
  return { error: "invalidSource" };
}

/**
 * cefr filter (csv 'b1,B2' → ['B1','B2']): normalize + allowlist + dedupe —
 * token lạ sau normalize bị bỏ (khớp nothing, không lỗi — filter là UI chips).
 */
export function parseCefrFilter(raw: string | null): CefrLevel[] {
  if (!raw) return [];
  const out = new Set<CefrLevel>();
  for (const token of raw.split(",")) {
    const normalized = normalizeCefr(token);
    if (isCefrLevel(normalized)) out.add(normalized);
  }
  return [...out];
}

/**
 * Escape LIKE wildcard trong q (spec §4 deliberate bugfix: search literal
 * '%'/'_'/'\' trước đây vô nghĩa) — PG ILIKE default escape = backslash.
 */
export function escapeLikePattern(q: string): string {
  return q.replace(/([\\%_])/g, "\\$1");
}

/** Path lưu audio của word — unique theo word id, re-upload = replace. */
export function buildWordAudioPath(wordId: number, ext: string): string {
  return `audio/vocabulary/${wordId}.${ext}`;
}

/** URL playback từ giá trị DB: blob → URL CDN nguyên; local → / + path. */
export function resolveStoredAudioUrl(value: string): string {
  return /^https?:\/\//.test(value) ? value : `/${value}`;
}

/** Field word input — snake_case khớp cột DB (body import/API dùng y nguyên).
 *  cefr/source (SF-2): optional — chỉ crawl-on-add approve set; import hiện có
 *  (6 caller) không đụng, type additive không break.
 *  pos/synonyms/image_url (VU-43 SF-1): optional — validateWordInput chỉ nhét
 *  key khi body CUNG CẤP (import path cũ không gửi → create insert null,
 *  giữ nguyên chuỗi query cũ). */
export type WordInput = {
  word: string;
  ipa: string | null;
  meaning_vi: string;
  example: string | null;
  audio_url: string | null;
  cefr?: string | null;
  source?: string | null;
  pos?: string | null;
  synonyms?: string | null;
  image_url?: string | null;
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

  // VU-43 SF-1: field mới — chỉ validate khi body cung cấp (key không có mặt
  // → không nhét vào output, giữ chuỗi query cũ cho consumer hiện có)
  const result: WordInput = {
    word,
    meaning_vi: meaning,
    ipa: optionalField(raw.ipa, IPA_MAX),
    example: optionalField(raw.example, EXAMPLE_MAX),
    audio_url: audio,
  };
  if (raw.cefr !== undefined) {
    const cefr = validateCefrInput(raw.cefr);
    if (cefr !== null && typeof cefr === "object") return cefr;
    result.cefr = cefr;
  }
  if (raw.pos !== undefined) {
    const pos = validatePosInput(raw.pos);
    if (pos !== null && typeof pos === "object") return pos;
    result.pos = pos;
  }
  if (raw.synonyms !== undefined) {
    const synonyms = validateSynonymsInput(raw.synonyms);
    if (synonyms !== null && typeof synonyms === "object") return synonyms;
    result.synonyms = synonyms;
  }
  const rawImage = raw.image_url ?? raw.imageUrl;
  if (rawImage !== undefined) {
    const imageUrl = validateImageUrlInput(rawImage);
    if (imageUrl !== null && typeof imageUrl === "object") return imageUrl;
    result.image_url = imageUrl;
  }
  return result;
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

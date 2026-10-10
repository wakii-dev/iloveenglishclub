/**
 * CSV builder thuần cho export vocabulary (VU-43 SF-1 task 7) — PURE, unit
 * test trực tiếp. Spec §5.6: cột cố định word,ipa,meaning_vi,example,cefr,
 * source,pos,synonyms,audio_url,image_url; escape RFC4180 (quote doubling);
 * BOM UTF-8 đầu file (Excel mở đúng dấu tiếng Việt); 0 rows → header-only.
 * >10k do ROUTE chặn trước (tooMany — không truncate âm thầm).
 */

export const EXPORT_CSV_COLUMNS = [
  "word",
  "ipa",
  "meaning_vi",
  "example",
  "cefr",
  "source",
  "pos",
  "synonyms",
  "audio_url",
  "image_url",
] as const;

export type ExportCsvRow = {
  word: string;
  meaning_vi: string;
  ipa?: string | null;
  example?: string | null;
  cefr?: string | null;
  source?: string | null;
  pos?: string | null;
  synonyms?: string | null;
  audio_url?: string | null;
  image_url?: string | null;
};

export const EXPORT_MAX_ROWS = 10000;

/** Escape RFC4180: chứa quote/comma/newline → bọc quote, quote nội → "". */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvCellNullable(value: string | null | undefined): string {
  return csvCell(value ?? "");
}

/** BOM UTF-8 + header + rows (CRLF RFC4180). 0 rows → header-only. */
export function buildVocabularyCsv(rows: ExportCsvRow[]): string {
  const lines = [EXPORT_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.word),
        csvCellNullable(row.ipa),
        csvCell(row.meaning_vi),
        csvCellNullable(row.example),
        csvCellNullable(row.cefr),
        csvCellNullable(row.source),
        csvCellNullable(row.pos),
        csvCellNullable(row.synonyms),
        csvCellNullable(row.audio_url),
        csvCellNullable(row.image_url),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

/** filename spec §5.6: vocabulary-YYYY-MM-DD.csv (ngày UTC — log server). */
export function exportCsvFilename(now: Date = new Date()): string {
  return `vocabulary-${now.toISOString().slice(0, 10)}.csv`;
}

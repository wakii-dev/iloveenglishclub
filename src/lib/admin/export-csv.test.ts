import { describe, expect, it } from "vitest";

/**
 * export-csv (VU-43 SF-1 task 7) — golden test: header 10 cột pin, escape
 * RFC4180 (quote doubling, comma/newline trong quote), BOM UTF-8, 0 rows →
 * header-only, null → cell rỗng.
 */
import {
  EXPORT_CSV_COLUMNS,
  buildVocabularyCsv,
  exportCsvFilename,
  type ExportCsvRow,
} from "./export-csv";

const row = (over: Partial<ExportCsvRow> = {}): ExportCsvRow => ({
  word: "apple",
  ipa: "/ˈæp.əl/",
  meaning_vi: "quả táo",
  example: "I eat an apple.",
  cefr: "A1",
  source: "oxford-ld",
  pos: "noun",
  synonyms: "x, y",
  audio_url: "https://cdn.example.com/a.mp3",
  image_url: null,
  ...over,
});

describe("buildVocabularyCsv", () => {
  it("golden: header 10 cột đúng thứ tự + BOM UTF-8 đầu file", () => {
    const csv = buildVocabularyCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv.slice(1).split("\r\n")[0]).toBe(EXPORT_CSV_COLUMNS.join(","));
    expect(csv.slice(1).split("\r\n")[1]).toBe(
      'apple,/ˈæp.əl/,quả táo,I eat an apple.,A1,oxford-ld,noun,"x, y",https://cdn.example.com/a.mp3,',
    );
  });

  it("giữ nguyên dấu tiếng Việt (không lỗi font — BOM + utf-8)", () => {
    const csv = buildVocabularyCsv([row({ meaning_vi: "nghĩa ví dụ: quả táo, ăn được" })]);
    expect(csv).toContain("nghĩa ví dụ: quả táo, ăn được");
  });

  it("escape RFC4180: quote nội → doubling; cell chứa comma/newline → bọc quote", () => {
    const csv = buildVocabularyCsv([
      row({ meaning_vi: 'nói "hello"' }),
      row({ word: "multi\nline", example: "dòng 1\r\ndòng 2" }),
    ]);
    expect(csv).toContain('"nói ""hello"""');
    expect(csv).toContain('"multi\nline"');
    expect(csv).toContain('"dòng 1\r\ndòng 2"');
  });

  it("0 rows → header-only; null → cell rỗng", () => {
    const empty = buildVocabularyCsv([]);
    expect(empty.slice(1)).toBe(EXPORT_CSV_COLUMNS.join(","));
    expect(empty.charCodeAt(0)).toBe(0xfeff);

    const csv = buildVocabularyCsv([row({ ipa: null, example: null, cefr: null })]);
    const cells = csv.slice(1).split("\r\n")[1]?.split(",");
    expect(cells?.[1]).toBe(""); // ipa null
    expect(cells?.[2]).toBe("quả táo");
  });
});

describe("exportCsvFilename", () => {
  it("pattern vocabulary-YYYY-MM-DD.csv (UTC)", () => {
    expect(exportCsvFilename(new Date("2026-10-10T13:45:00Z"))).toBe(
      "vocabulary-2026-10-10.csv",
    );
  });
});

describe("formula-injection guard (SF-4 — security-audit P2-1)", () => {
  // Cell khớp /^[=+\-@\t\r]/ → prefix `'` để Excel/LibreOffice mở file KHÔNG
  // thực thi formula (OWASP CSV injection). Bảng pin 5 ký tự đầu nguy hiểm.
  it.each([
    ["=HYPERLINK(\"https://evil.test\",\"pwn\")", "'=HYPERLINK"],
    ["+cmd|'/c calc'!A0", "'+cmd"],
    ["-2+3|cmd", "'-2"],
    ["@SUM(1)", "'@SUM"],
    ["\tSUM(A1)", "'\tSUM"],
    ["\rSUM(A1)", "'\rSUM"],
  ])("word %j được prefix ' — không chạy formula khi mở Excel", (word, expected) => {
    const csv = buildVocabularyCsv([row({ word })]);
    expect(csv).toContain(expected);
  });

  it("prefix ' không phá cell bình thường + vẫn escape RFC khi có comma", () => {
    // 'apple (khớp prefix nhưng vô hại) — KHÔNG bị prefix (chỉ ký tự nguy hiểm)
    // word = cột ĐẦU dòng — đứng sau CRLF header, không phải sau comma
    expect(buildVocabularyCsv([row({ word: "apple" })])).toContain("\r\napple,");
    // Cell vừa nguy hiểm vừa chứa comma: prefix ' rồi vẫn bọc quote
    const csv = buildVocabularyCsv([row({ word: "=1,2" })]);
    expect(csv).toContain("\"'=1,2\"");
  });
});

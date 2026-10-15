import { describe, expect, it } from "vitest";

/**
 * Vocabulary validate + import parsing (SF-1 t-1.2) — pure functions, không
 * mock. Report per-line là contract API import: line = dòng vật lý CSV /
 * index+1 JSON, file-level lỗi line 0 (hoặc header CSV line 1).
 */
import {
  buildWordAudioPath,
  isCefrLevel,
  normalizeCefr,
  normalizeSynonyms,
  parseCefrFilter,
  planImport,
  parseVocabularyCsv,
  parseVocabularyJson,
  resolveStoredAudioUrl,
  validateCefrInput,
  validateImageUrlInput,
  validatePosInput,
  validateSourceInput,
  validateSynonymsInput,
  validateWordInput,
  type ParsedWordRow,
} from "./vocabulary";

/** Narrow helper: kỳ vọng validate FAIL → trả mã lỗi (TS union narrow). */
function errOf(raw: Record<string, unknown>): string {
  const result = validateWordInput(raw);
  if (!("error" in result)) throw new Error(`expected error, got ok: ${JSON.stringify(result)}`);
  return result.error;
}

/** Narrow helper: kỳ vọng validate OK → trả WordInput. */
function okOf(raw: Record<string, unknown>): ReturnType<typeof validateWordInput> & {
  error?: undefined;
} {
  const result = validateWordInput(raw);
  if ("error" in result) throw new Error(`expected ok, got error: ${result.error}`);
  return result;
}

describe("validateWordInput", () => {
  it("hợp lệ: trim + optional rỗng → null", () => {
    expect(
      validateWordInput({
        word: "  apple  ",
        meaning_vi: " quả táo ",
        ipa: " /ˈæp.əl/ ",
        example: " I eat an apple. ",
        audio_url: " https://cdn.example.com/a.mp3 ",
      }),
    ).toEqual({
      word: "apple",
      meaning_vi: "quả táo",
      ipa: "/ˈæp.əl/",
      example: "I eat an apple.",
      audio_url: "https://cdn.example.com/a.mp3",
    });
  });

  it("optional thiếu/không phải string → null; bắt buộc thiếu → mã lỗi", () => {
    expect(validateWordInput({ word: "a", meaning_vi: "b" })).toEqual({
      word: "a",
      meaning_vi: "b",
      ipa: null,
      example: null,
      audio_url: null,
    });
    expect(errOf({})).toBe("wordRequired");
    expect(errOf({ word: "   " })).toBe("wordRequired");
    expect(errOf({ word: 42 })).toBe("wordRequired");
    expect(errOf({ word: "a" })).toBe("meaningRequired");
  });

  it.each([
    ["word", "x".repeat(101), "wordTooLong"],
    ["meaning_vi", "x".repeat(501), "meaningTooLong"],
  ])("%s vượt ngưỡng → quá dài", (field, value, expected) => {
    const raw: Record<string, unknown> = { word: "a", meaning_vi: "b" };
    raw[field] = value;
    expect(errOf(raw)).toBe(expected);
  });

  it("word chứa newline → wordTooLong (định danh 1 dòng)", () => {
    expect(errOf({ word: "a\nb", meaning_vi: "b" })).toBe("wordTooLong");
  });

  it("audio_url phải http(s) nếu có; rỗng → null", () => {
    expect(errOf({ word: "a", meaning_vi: "b", audio_url: "ftp://x" })).toBe(
      "invalidAudioUrl",
    );
    expect(okOf({ word: "a", meaning_vi: "b", audio_url: "   " }).audio_url).toBeNull();
  });
});

describe("parseVocabularyCsv", () => {
  const HEAD = "word,meaning_vi,ipa,example,audio_url\n";

  it("2 dòng hợp lệ → line 2, 3 theo dòng vật lý", () => {
    const { rows, errors } = parseVocabularyCsv(
      `${HEAD}apple,quả táo,æp.əl,I eat an apple.,https://x/a.mp3\nbanana,quả chuối,,,`,
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      line: 2,
      word: "apple",
      meaning_vi: "quả táo",
      ipa: "æp.əl",
      example: "I eat an apple.",
      audio_url: "https://x/a.mp3",
    });
    expect(rows[1]).toEqual({
      line: 3,
      word: "banana",
      meaning_vi: "quả chuối",
      ipa: null,
      example: null,
      audio_url: null,
    });
  });

  it("thứ tự cột linh hoạt theo header", () => {
    const { rows } = parseVocabularyCsv("ipa,meaning_vi,word\n/æp/,quả táo,apple");
    expect(rows[0]).toMatchObject({ word: "apple", meaning_vi: "quả táo", ipa: "/æp/" });
  });

  it("quote RFC4180: phẩy/newline trong quote + \"\" escape; CRLF", () => {
    const { rows, errors } = parseVocabularyCsv(
      'word,meaning_vi\r\napple,"quả táo, xanh"\r\nbanana,"nói ""hi"" và,\rthêm"',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, word: "apple", meaning_vi: "quả táo, xanh", ipa: null, example: null, audio_url: null },
      {
        line: 3,
        word: "banana",
        meaning_vi: 'nói "hi" và,\rthêm',
        ipa: null,
        example: null,
        audio_url: null,
      },
    ]);
  });

  it("word quote chứa newline → wordTooLong tại đúng dòng vật lý", () => {
    const { rows, errors } = parseVocabularyCsv(
      'word,meaning_vi\napple,"quả táo"\n"ban\nana","xuống dòng"',
    );
    // "ban\nana" 1 field quote nhiều dòng — validate chặn word newline
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, word: "apple" });
    expect(errors).toEqual([{ line: 3, word: "ban\nana", error: "wordTooLong" }]);
  });

  it("thiếu cột bắt buộc trong header → badCsvHeader; quote lủng → badCsv", () => {
    expect(parseVocabularyCsv("word,ipa\na,b").errors[0].error).toBe("badCsvHeader");
    expect(parseVocabularyCsv(`${HEAD}a,b,"lủng`).errors[0].error).toBe("badCsv");
  });

  it("lỗi từng dòng không chặn dòng khác + dòng trống bỏ qua", () => {
    const { rows, errors } = parseVocabularyCsv(
      `${HEAD},thiếu word\napple,quả táo\n\nbanana,,thiếu meaning\n`,
    );
    expect(rows.map((r) => r.word)).toEqual(["apple"]);
    expect(errors).toEqual([
      { line: 2, word: "", error: "wordRequired" },
      { line: 5, word: "banana", error: "meaningRequired" },
    ]);
  });
});

describe("parseVocabularyJson", () => {
  it("array hợp lệ → line = index+1; chấp nhận camelCase meaningVi/audioUrl", () => {
    const { rows, errors } = parseVocabularyJson(
      JSON.stringify([
        { word: "apple", meaningVi: "quả táo", audioUrl: "https://x/a.mp3" },
        { word: "banana", meaning_vi: "quả chuối" },
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 1,
        word: "apple",
        meaning_vi: "quả táo",
        ipa: null,
        example: null,
        audio_url: "https://x/a.mp3",
      },
      {
        line: 2,
        word: "banana",
        meaning_vi: "quả chuối",
        ipa: null,
        example: null,
        audio_url: null,
      },
    ]);
  });

  it("không phải array / JSON hỏng → badJson (file-level line 0)", () => {
    expect(parseVocabularyJson("{[")).toEqual({
      rows: [],
      errors: [{ line: 0, word: "", error: "badJson" }],
    });
    expect(parseVocabularyJson('{"word": "a"}').errors[0].error).toBe("badJson");
  });

  it("phần tử không phải object → invalidRow; thiếu meaning → meaningRequired", () => {
    const { rows, errors } = parseVocabularyJson(
      JSON.stringify(["string trần", { word: "apple" }, { word: "ok", meaning_vi: "được" }]),
    );
    expect(rows.map((r) => r.word)).toEqual(["ok"]);
    expect(errors).toEqual([
      { line: 1, word: "", error: "invalidRow" },
      { line: 2, word: "apple", error: "meaningRequired" },
    ]);
  });
});

describe("planImport — dedupe trong file", () => {
  const row = (line: number, word: string): ParsedWordRow => ({
    line,
    word,
    meaning_vi: "nghĩa",
    ipa: null,
    example: null,
    audio_url: null,
  });

  it("word trùng dòng sau → duplicate, dòng đầu giữ; errors sort theo line", () => {
    const { rows, errors } = planImport(
      [row(2, "apple"), row(3, "banana"), row(4, "apple")],
      [{ line: 1, word: "x", error: "meaningRequired" }],
    );
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
    expect(errors).toEqual([
      { line: 1, word: "x", error: "meaningRequired" },
      { line: 4, word: "apple", error: "duplicate" },
    ]);
  });

  it("case-sensitive khớp UNIQUE words.word — Apple ≠ apple đều giữ", () => {
    const { rows, errors } = planImport([row(1, "Apple"), row(2, "apple")], []);
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});

describe("buildWordAudioPath + resolveStoredAudioUrl (t-1.3 upload leg)", () => {
  it("path unique theo word id + ext theo mime — re-upload cùng id = replace", () => {
    expect(buildWordAudioPath(42, "mp3")).toBe("audio/vocabulary/42.mp3");
    expect(buildWordAudioPath(7, "m4a")).toBe("audio/vocabulary/7.m4a");
  });

  it("URL CDN (blob) giữ nguyên; path local (dev) thêm prefix /", () => {
    expect(resolveStoredAudioUrl("https://blob.vercel-storage.com/x.mp3")).toBe(
      "https://blob.vercel-storage.com/x.mp3",
    );
    expect(resolveStoredAudioUrl("http://cdn.example.com/y.wav")).toBe(
      "http://cdn.example.com/y.wav",
    );
    expect(resolveStoredAudioUrl("audio/vocabulary/42.mp3")).toBe(
      "/audio/vocabulary/42.mp3",
    );
  });
});

describe("validateCefrInput (VU-43 SF-1 — spec §4 pin boundary)", () => {
  it("'b1 ' → 'B1' (trim+upper); allowlist chính xác hoa", () => {
    expect(validateCefrInput("b1 ")).toBe("B1");
    expect(validateCefrInput("  a2")).toBe("A2");
    expect(validateCefrInput("C2")).toBe("C2");
  });

  it("rỗng/không phải string → null (optional); lệch allowlist → invalidCefr", () => {
    expect(validateCefrInput("")).toBeNull();
    expect(validateCefrInput(undefined)).toBeNull();
    expect(validateCefrInput(5)).toBeNull();
    expect(validateCefrInput("B7")).toEqual({ error: "invalidCefr" });
    expect(validateCefrInput("Pre-A1")).toEqual({ error: "invalidCefr" });
  });

  it("normalizeCefr + isCefrLevel + parseCefrFilter: csv normalize, token lạ bỏ", () => {
    expect(normalizeCefr(" b2 ")).toBe("B2");
    expect(isCefrLevel("B1")).toBe(true);
    expect(isCefrLevel("b1")).toBe(false);
    expect(parseCefrFilter("b1, A2,,x5,B1")).toEqual(["B1", "A2"]); // thứ tự xuất hiện, dedupe
    expect(parseCefrFilter(null)).toEqual([]);
    expect(parseCefrFilter("zzz")).toEqual([]);
  });
});

describe("validatePosInput + validateSynonymsInput + validateImageUrlInput (VU-43 SF-1)", () => {
  it("pos: lowercase-trim, ≤32; rỗng → null; vượt → invalidPos", () => {
    expect(validatePosInput("  Noun ")).toBe("noun");
    expect(validatePosInput("")).toBeNull();
    expect(validatePosInput("x".repeat(33))).toEqual({ error: "invalidPos" });
    expect(validatePosInput("x".repeat(32))).toBe("x".repeat(32));
  });

  it("synonyms chuẩn hoá GHI: ' x , y ' → 'x, y'; bỏ item rỗng; >500 → invalidSynonyms", () => {
    expect(normalizeSynonyms(" x , y ")).toBe("x, y");
    expect(normalizeSynonyms(",x,,y,")).toBe("x, y");
    expect(validateSynonymsInput(" x , y ")).toBe("x, y");
    expect(validateSynonymsInput(" , ")).toBeNull();
    expect(validateSynonymsInput("a,".repeat(260))).toEqual({ error: "invalidSynonyms" });
    expect(validateSynonymsInput(42)).toBeNull();
  });

  it("imageUrl: http(s) shape; rỗng → null; sai shape/overflow → invalidImageUrl", () => {
    expect(validateImageUrlInput(" https://blob.vercel-storage.com/i.png ")).toBe(
      "https://blob.vercel-storage.com/i.png",
    );
    expect(validateImageUrlInput("ftp://x/i.png")).toEqual({ error: "invalidImageUrl" });
    expect(validateImageUrlInput("/images/words/1.png")).toEqual({ error: "invalidImageUrl" });
    expect(validateImageUrlInput("")).toBeNull();
    expect(validateImageUrlInput(`https://x.com/${"a".repeat(1000)}`)).toEqual({
      error: "invalidImageUrl",
    });
  });

  it("validateSourceInput: chỉ 2 giá trị chuẩn; 'teacher' ≡ null; lạ → invalidSource", () => {
    expect(validateSourceInput("oxford-ld")).toBe("oxford-ld");
    expect(validateSourceInput("teacher")).toBeNull();
    expect(validateSourceInput("")).toBeNull();
    expect(validateSourceInput(null)).toBeNull();
    expect(validateSourceInput("gpt")).toEqual({ error: "invalidSource" });
  });
});

describe("validateWordInput field mới (VU-43 SF-1 — additive)", () => {
  it("body gửi field mới → validate + normalize vào output", () => {
    const out = okOf({
      word: "apple",
      meaning_vi: "quả táo",
      cefr: " b1 ",
      pos: " Noun ",
      synonyms: " x , y ",
      image_url: "https://cdn.example.com/i.png",
    });
    expect(out.cefr).toBe("B1");
    expect(out.pos).toBe("noun");
    expect(out.synonyms).toBe("x, y");
    expect(out.image_url).toBe("https://cdn.example.com/i.png");
  });

  it("imageUrl chấp nhận camelCase (imageUrl) — route map snake_case/camel", () => {
    const out = okOf({ word: "a", meaning_vi: "b", imageUrl: "https://x.com/i.png" });
    expect(out.image_url).toBe("https://x.com/i.png");
  });

  it("field mới sai → mã lỗi từng field; body cũ (không gửi) → output giữ shape cũ", () => {
    expect(errOf({ word: "a", meaning_vi: "b", cefr: "Z9" })).toBe("invalidCefr");
    expect(errOf({ word: "a", meaning_vi: "b", pos: "x".repeat(40) })).toBe("invalidPos");
    expect(errOf({ word: "a", meaning_vi: "b", synonyms: "a,".repeat(300) })).toBe(
      "invalidSynonyms",
    );
    expect(errOf({ word: "a", meaning_vi: "b", image_url: "nope" })).toBe("invalidImageUrl");
    const out = okOf({ word: "a", meaning_vi: "b" });
    expect(out).toEqual({ word: "a", meaning_vi: "b", ipa: null, example: null, audio_url: null });
    expect("cefr" in out).toBe(false);
    expect("pos" in out).toBe(false);
  });
});

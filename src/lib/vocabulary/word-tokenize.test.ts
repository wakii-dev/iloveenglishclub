import { describe, expect, it } from "vitest";
import {
  normalizeLookupToken,
  tokenizeWords,
} from "./word-tokenize";

/**
 * Token hoá text click-lookup (SF-5 t-5.3) — roundtrip giữ nguyên bản gốc
 * (không phá text render), tách đúng từ có dấu nháy/gạch nối.
 */
describe("tokenizeWords", () => {
  it("câu transcript → word/sep xen kẽ, join lại y nguyên", () => {
    const text = "I play football with my friends every Saturday.";
    const tokens = tokenizeWords(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    expect(tokens.filter((t) => t.kind === "word").map((t) => t.text)).toEqual([
      "I",
      "play",
      "football",
      "with",
      "my",
      "friends",
      "every",
      "Saturday",
    ]);
  });

  it("dấu nháy/gạch nối thuộc 1 từ (don't, well-known)", () => {
    const tokens = tokenizeWords("I don't like well-known lies.");
    expect(tokens.filter((t) => t.kind === "word").map((t) => t.text)).toEqual([
      "I",
      "don't",
      "like",
      "well-known",
      "lies",
    ]);
  });

  it("text rỗng/chỉ khoảng trắng → không word", () => {
    expect(tokenizeWords("")).toEqual([]);
    expect(tokenizeWords("   ")).toEqual([{ kind: "sep", text: "   " }]);
  });

  it("số và dấu unicode giữ nguyên vị trí", () => {
    const tokens = tokenizeWords("Unit 3: café — 20 phút");
    expect(tokens.map((t) => t.text).join("")).toBe("Unit 3: café — 20 phút");
    expect(tokens.filter((t) => t.kind === "word").map((t) => t.text)).toEqual([
      "Unit",
      "3",
      "café",
      "20",
      "phút",
    ]);
  });
});

describe("normalizeLookupToken", () => {
  it.each([
    ["Football", "football"],
    ["  SPACE  ", "space"],
    ["dogs’", "dogs"],
    ["'tis", "tis"],
    ["well-", "well"],
    ["'--'", ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeLookupToken(input)).toBe(expected);
  });
});

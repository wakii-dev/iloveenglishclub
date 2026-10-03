import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEntry } from "./parse";

// Fixtures = contract test (HTML excerpts TRIM từ entry thật 2026-10-04) —
// đặt chỗ tái dùng cho e2e SF-3, KHÔNG author file trùng.
const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseEntry — Oxford entry HTML → OxfordEntry", () => {
  it("multi-pos (tree): headword/pos/cefr/ox3000 + ipa + audio uk&us + senses + idioms", () => {
    const e = parseEntry(fixture("multi-pos.html"));
    expect(e).not.toBeNull();
    expect(e!.headword).toBe("tree");
    expect(e!.pos).toBe("noun");
    expect(e!.cefr).toBe("A1"); // fkcefr="a1" → normalize uppercase
    expect(e!.ox3000).toBe(true);
    expect(e!.ipaUk).toBe("/triː/");
    expect(e!.ipaUs).toBe("/triː/");
    expect(e!.audioUkUrl).toMatch(/\/media\/english\/uk_pron\/.+\.mp3$/);
    expect(e!.audioUsUrl).toMatch(/\/media\/english\/us_pron\/.+\.mp3$/);
    expect(e!.senses.length).toBeGreaterThanOrEqual(1);
    expect(e!.senses[0].def).toContain("a tall plant");
    expect(e!.senses[0].examples.length).toBeGreaterThanOrEqual(1);
    // idioms giữ trong raw — 6 idm-g, mỗi cái senses riêng
    expect(e!.idioms).toHaveLength(6);
    expect(e!.idioms[0].headword).toContain("the apple doesn’t fall");
    expect(e!.idioms.every((i) => i.senses.length >= 1)).toBe(true);
    expect(e!.phrasalVerbs).toEqual([]);
  });

  it("homonym-2 (three-D): headword ≠ slug, không cefr → null, không ox3000 → false", () => {
    const e = parseEntry(fixture("homonym-2.html"));
    expect(e).not.toBeNull();
    expect(e!.headword).toBe("three-D");
    expect(e!.pos).toBe("adjective");
    expect(e!.cefr).toBeNull();
    expect(e!.ox3000).toBe(false);
    expect(e!.senses).toHaveLength(1);
    expect(e!.senses[0].def).toContain("length, width and depth");
    expect(e!.senses[0].examples).toContain("a three-D image");
    expect(e!.idioms).toEqual([]);
  });

  it("entry-basic (color): cefr B1, ipa uk≠us, senses + idioms đầy đủ", () => {
    const e = parseEntry(fixture("entry-basic.html"));
    expect(e).not.toBeNull();
    expect(e!.headword).toBe("color");
    expect(e!.cefr).toBe("B1");
    expect(e!.ox3000).toBe(true);
    expect(e!.ipaUk).toBe("/ˈkʌlə(r)/");
    expect(e!.ipaUs).toBe("/ˈkʌlər/");
    expect(e!.senses.length).toBeGreaterThanOrEqual(1);
    expect(e!.idioms.length).toBeGreaterThanOrEqual(1);
  });

  it("us-only: KHÔNG UK audio/ipa → null cả hai (không parse fail), US vẫn có", () => {
    const e = parseEntry(fixture("us-only.html"));
    expect(e).not.toBeNull();
    expect(e!.ipaUk).toBeNull();
    expect(e!.audioUkUrl).toBeNull();
    expect(e!.ipaUs).toBe("/ˈkʌlər/");
    expect(e!.audioUsUrl).toMatch(/us_pron\/.+\.mp3$/);
    expect(e!.cefr).toBe("B1");
  });

  it("HTML không có headword (404 shell / selector miss) → null = parse fail", () => {
    expect(parseEntry("<html><body>No entry</body></html>")).toBeNull();
    expect(parseEntry("")).toBeNull();
  });
});

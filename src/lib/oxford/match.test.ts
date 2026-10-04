import { describe, expect, it } from "vitest";
import { normalizeHeadword, normalizeMatch, matchWord, type MatchCandidate } from "./match";

/**
 * Match rule words ↔ crawl_entries (VU-32 SF-2 — contract SF-3 phụ thuộc):
 * normalizeMatch = trim + lowercase + strip `_\d+$` + '-'→space + collapse.
 * Winner: headword exact > slug match → cefr non-null → id nhỏ nhất.
 */

const cand = (over: Partial<MatchCandidate> & { id: number; slug: string }): MatchCandidate => ({
  word: null,
  cefr: null,
  ...over,
});

describe("normalizeMatch", () => {
  it.each([
    ["  Tree ", "tree"],
    ["BANK", "bank"],
    ["bank_1", "bank"],
    ["three-d", "three d"],
    ["ice  cream", "ice cream"],
    [" A--b_2 ", "a b"],
  ])("%s → %s", (input, want) => {
    expect(normalizeMatch(input)).toBe(want);
  });
});

describe("normalizeHeadword", () => {
  // headword: trim + lowercase — KHÔNG strip _N, KHÔNG đổi dash (contract)
  it.each([
    [" Tree ", "tree"],
    ["three-d", "three-d"],
    ["bank_1", "bank_1"],
  ])("%s → %s", (input, want) => {
    expect(normalizeHeadword(input)).toBe(want);
  });
});

describe("matchWord — winner rule", () => {
  it("headword exact thắng slug match", () => {
    const byHeadword = cand({ id: 9, slug: "tree-plant", word: "tree", cefr: null });
    const bySlug = cand({ id: 1, slug: "tree", word: null, cefr: "A1" });
    expect(matchWord("Tree", [bySlug, byHeadword])).toBe(byHeadword);
  });

  it("không headword → slug match (qua normalizeMatch cả 2 phía)", () => {
    const homonym2 = cand({ id: 5, slug: "three-d_2", word: "three-D", cefr: "B1" });
    // word "three D" → norm "three d"; slug "three-d_2" → "three d" ✓
    expect(matchWord("three D", [homonym2])).toBe(homonym2);
  });

  it("homograph: entry cefr non-null thắng (dù id lớn hơn)", () => {
    const bank1 = cand({ id: 1, slug: "bank_1", word: "bank", cefr: null });
    const bank2 = cand({ id: 2, slug: "bank_2", word: "bank", cefr: "B1" });
    expect(matchWord("bank", [bank1, bank2])).toBe(bank2);
    // đảo: bank_1 có cefr → thắng bank_2
    const bank1b = cand({ id: 1, slug: "bank_1", word: "bank", cefr: "A1" });
    const bank2b = cand({ id: 2, slug: "bank_2", word: "bank", cefr: null });
    expect(matchWord("bank", [bank1b, bank2b])).toBe(bank1b);
  });

  it("cùng trạng thái cefr → id nhỏ nhất (deterministic)", () => {
    const a = cand({ id: 7, slug: "coal_1", word: "coal", cefr: null });
    const b = cand({ id: 3, slug: "coal_2", word: "coal", cefr: null });
    expect(matchWord("coal", [a, b])).toBe(b);
  });

  it("word trống/entry word null → vẫn match qua slug", () => {
    const pending = cand({ id: 2, slug: "wander", word: null });
    expect(matchWord("WANDER", [pending])).toBe(pending);
  });

  it("không candidate khớp → null", () => {
    expect(matchWord("zzz", [cand({ id: 1, slug: "tree", word: "tree" })])).toBeNull();
    expect(matchWord("zzz", [])).toBeNull();
  });
});

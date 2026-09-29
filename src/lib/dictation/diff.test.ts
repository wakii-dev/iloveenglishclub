import { describe, expect, it } from "vitest";
import { normalizeToken, tokenize } from "./diff";

describe("tokenize — spec §5.5 (context pack mục 1)", () => {
  it("chia theo khoảng trắng đơn", () => {
    expect(tokenize("The cat sat")).toEqual(["The", "cat", "sat"]);
  });

  it("gộp nhiều loại whitespace (space/tab/xuống dòng)", () => {
    expect(tokenize("  a\t b\nc  ")).toEqual(["a", "b", "c"]);
  });

  it("chuỗi rỗng → mảng rỗng", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("chỉ whitespace → mảng rỗng", () => {
    expect(tokenize("   \t\n  ")).toEqual([]);
  });

  it("apostrophe cong ’ chuẩn hóa thành ' (contract: don’t = don't)", () => {
    expect(tokenize("don’t stop")).toEqual(["don't", "stop"]);
  });

  it("contraction là 1 token (contract §5)", () => {
    expect(tokenize("I don't know")).toEqual(["I", "don't", "know"]);
  });
});

describe("normalizeToken — strict/relaxed (spec §1.2)", () => {
  it("strict: giữ nguyên token (phân biệt hoa/thường + dấu câu đính token)", () => {
    expect(normalizeToken("Cat.", "strict")).toBe("Cat.");
  });

  it("relaxed: lowercase + strip dấu câu biên phải (contract: 'cat.' = 'cat')", () => {
    expect(normalizeToken("Cat.", "relaxed")).toBe("cat");
  });

  it("relaxed: strip dấu câu cả hai biên", () => {
    expect(normalizeToken("(Hello),", "relaxed")).toBe("hello");
  });

  it("relaxed: dấu câu GIỮA token giữ nguyên — don't bất biến", () => {
    expect(normalizeToken("don't", "relaxed")).toBe("don't");
  });

  it("relaxed: dấu câu GIỮA token giữ nguyên — 3.5 bất biến", () => {
    expect(normalizeToken("3.5", "relaxed")).toBe("3.5");
  });

  it("relaxed: symbol biên bị strip ($, theo \\p{S} — mở rộng có chủ ý spec §1.2)", () => {
    expect(normalizeToken("$5", "relaxed")).toBe("5");
  });

  it("relaxed: token toàn dấu câu → rỗng", () => {
    expect(normalizeToken("...", "relaxed")).toBe("");
  });

  it("relaxed: token chữ thường không dấu câu → chính nó", () => {
    expect(normalizeToken("cat", "relaxed")).toBe("cat");
  });
});

import { computeAccuracy, computeWpm, diffWords } from "./diff";

describe("diffWords — positional, contract §5.5 (context pack mục 4)", () => {
  it("contract: 'cat.' ≠ 'cat' strict → wrong, allCorrect=false", () => {
    const d = diffWords("The cat.", "The cat", "strict");
    expect(d.words[1]).toEqual({
      transcriptIndex: 1,
      transcriptToken: "cat.",
      typedToken: "cat",
      status: "wrong",
    });
    expect(d.matchedCount).toBe(1);
    expect(d.wrongCount).toBe(1);
    expect(d.missingCount).toBe(0);
    expect(d.extraCount).toBe(0);
    expect(d.transcriptWordCount).toBe(2);
    expect(d.firstIncorrectIndex).toBe(1);
    expect(d.allCorrect).toBe(false);
  });

  it("contract: 'cat.' = 'cat' relaxed → matched, allCorrect=true, firstIncorrect null", () => {
    const d = diffWords("The cat.", "The cat", "relaxed");
    expect(d.words[1]!.status).toBe("matched");
    expect(d.matchedCount).toBe(2);
    expect(d.firstIncorrectIndex).toBeNull();
    expect(d.allCorrect).toBe(true);
  });

  it("contract: don’t = don't (apostrophe chuẩn hóa) → matched hết", () => {
    const d = diffWords("I don’t know", "I don't know", "strict");
    expect(d.allCorrect).toBe(true);
    expect(d.matchedCount).toBe(3);
  });

  it("thừa từ: extra có transcriptIndex -1, không nằm trong mẫu số", () => {
    const d = diffWords("The cat", "The fat cat", "strict");
    expect(d.words).toEqual([
      { transcriptIndex: 0, transcriptToken: "The", typedToken: "The", status: "matched" },
      { transcriptIndex: 1, transcriptToken: "cat", typedToken: "fat", status: "wrong" },
      { transcriptIndex: -1, transcriptToken: null, typedToken: "cat", status: "extra" },
    ]);
    expect(d.matchedCount).toBe(1);
    expect(d.extraCount).toBe(1);
    expect(d.transcriptWordCount).toBe(2);
    expect(d.allCorrect).toBe(false);
  });

  it("thiếu từ: missing ở đuôi có typedToken null", () => {
    const d = diffWords("The big cat", "The cat", "strict");
    expect(d.words[1]).toEqual({
      transcriptIndex: 1,
      transcriptToken: "big",
      typedToken: "cat",
      status: "wrong",
    });
    expect(d.words[2]).toEqual({
      transcriptIndex: 2,
      transcriptToken: "cat",
      typedToken: null,
      status: "missing",
    });
    expect(d.missingCount).toBe(1);
    expect(d.firstIncorrectIndex).toBe(1);
  });

  it("typed rỗng → mọi từ transcript missing, firstIncorrect 0", () => {
    const d = diffWords("Hello world", "", "strict");
    expect(d.missingCount).toBe(2);
    expect(d.matchedCount).toBe(0);
    expect(d.firstIncorrectIndex).toBe(0);
    expect(d.allCorrect).toBe(false);
  });

  it("transcript rỗng + typed có từ → toàn extra, count 0", () => {
    const d = diffWords("", "hi", "strict");
    expect(d.transcriptWordCount).toBe(0);
    expect(d.extraCount).toBe(1);
    expect(d.words[0]).toEqual({
      transcriptIndex: -1,
      transcriptToken: null,
      typedToken: "hi",
      status: "extra",
    });
    expect(d.allCorrect).toBe(false);
  });

  it("degenerate: cả hai rỗng → allCorrect true (spec §1.2)", () => {
    const d = diffWords("", "", "strict");
    expect(d.words).toEqual([]);
    expect(d.allCorrect).toBe(true);
  });
});

describe("computeAccuracy — mẫu số TRANSCRIPT (context pack mục 5)", () => {
  it("matched / transcriptWordCount", () => {
    const d = diffWords("The big cat", "The big cat", "strict");
    expect(computeAccuracy(d)).toBe(1);
  });

  it("thừa từ không tăng điểm: 1/2 (mẫu số transcript)", () => {
    const d = diffWords("The cat", "The fat cat", "strict");
    expect(computeAccuracy(d)).toBe(0.5);
  });

  it("thiếu từ lệch vị trí: 1/3 (positional)", () => {
    const d = diffWords("The big cat", "The cat", "strict");
    expect(computeAccuracy(d)).toBeCloseTo(1 / 3);
  });

  it("transcript 0 từ → 0 (guard chia 0)", () => {
    expect(computeAccuracy(diffWords("", "hi", "strict"))).toBe(0);
  });
});

describe("computeWpm — theo duration audio GỐC (context pack mục 6)", () => {
  it("6 từ đúng trong 60s → 6 wpm", () => {
    const d = diffWords("a b c d e f", "a b c d e f", "strict");
    expect(computeWpm(d, 60000)).toBe(6);
  });

  it("6 từ trong 30s → 12 wpm", () => {
    const d = diffWords("a b c d e f", "a b c d e f", "strict");
    expect(computeWpm(d, 30000)).toBe(12);
  });

  it("durationMs 0 → 0", () => {
    const d = diffWords("a b", "a b", "strict");
    expect(computeWpm(d, 0)).toBe(0);
  });

  it("durationMs âm → 0", () => {
    const d = diffWords("a b", "a b", "strict");
    expect(computeWpm(d, -5)).toBe(0);
  });

  it("0 từ đúng → 0 wpm", () => {
    const d = diffWords("a b", "x y", "strict");
    expect(computeWpm(d, 60000)).toBe(0);
  });
});

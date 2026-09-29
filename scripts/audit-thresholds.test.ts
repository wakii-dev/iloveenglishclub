import { describe, expect, it } from "vitest";
// RED lúc viết: module chưa tồn tại (TDD — test trước, plan T2 Step 1)
import {
  evalCategory,
  median,
  summarize,
} from "./audit-thresholds.mjs";

describe("evalCategory — ngưỡng binary §9 (score 0-1, min 0-1)", () => {
  it("score ĐÚNG bằng min → PASS (biên trên)", () => {
    expect(evalCategory(0.95, 0.95)).toBe(true);
    expect(evalCategory(0.85, 0.85)).toBe(true);
  });
  it("score dưới min (dù 0.0001) → FAIL", () => {
    expect(evalCategory(0.9499, 0.95)).toBe(false);
    expect(evalCategory(0.8499, 0.85)).toBe(false);
  });
  it("score trên min → PASS", () => {
    expect(evalCategory(0.96, 0.95)).toBe(true);
    expect(evalCategory(1, 0.85)).toBe(true);
  });
  it("score null/undefined (run lỗi) → FAIL, không nổ", () => {
    expect(evalCategory(null, 0.95)).toBe(false);
    expect(evalCategory(undefined, 0.85)).toBe(false);
  });
});

describe("median — protocol 3 runs/URL", () => {
  it("số lẻ phần tử → phần tử giữa", () => {
    expect(median([88, 90, 92])).toBe(90);
    expect(median([90])).toBe(90);
  });
  it("số chẵn phần tử → trung bình 2 phần tử giữa", () => {
    expect(median([88, 90, 91, 93])).toBe(90.5);
  });
  it("không sắp xếp trước cũng đúng (sort bên trong)", () => {
    expect(median([92, 88, 90])).toBe(90);
  });
  it("loại null (run lỗi) rồi lấy median phần còn lại", () => {
    expect(median([null, 90, 94])).toBe(92);
    expect(median([null, null, 90])).toBe(90);
  });
  it("toàn null → null (không chia 0)", () => {
    expect(median([null, null])).toBeNull();
  });
});

describe("summarize — per-URL median so ngưỡng + overall pass", () => {
  const TH = { performance: 0.85, accessibility: 0.95 };
  // .mjs trả row build động — TS không track key động, pin shape ở consumer
  type CatRow = { median: number | null; pass: boolean };
  type Summary = {
    perUrl: Array<{ url: string } & Record<string, CatRow>>;
    pass: boolean;
  };
  it("mọi URL mọi category đạt → overall pass", () => {
    const entries = [
      { url: "/en", scores: { performance: 0.88, accessibility: 0.96 } },
      { url: "/en", scores: { performance: 0.86, accessibility: 0.95 } },
      { url: "/en", scores: { performance: 0.9, accessibility: 0.94 } },
    ];
    const r = summarize(entries, TH) as Summary;
    expect(r.perUrl).toHaveLength(1);
    expect(r.perUrl[0].performance.median).toBe(0.88);
    expect(r.perUrl[0].performance.pass).toBe(true);
    // a11y runs [0.96, 0.95, 0.94] median 0.95 == min → PASS biên
    expect(r.perUrl[0].accessibility.median).toBe(0.95);
    expect(r.perUrl[0].accessibility.pass).toBe(true);
    expect(r.pass).toBe(true);
  });
  it("1 URL median dưới ngưỡng → perUrl fail + overall false", () => {
    const entries = [
      { url: "/ok", scores: { performance: 0.9, accessibility: 0.96 } },
      { url: "/bad", scores: { performance: 0.7, accessibility: 0.96 } },
      { url: "/bad", scores: { performance: 0.7, accessibility: 0.96 } },
      { url: "/bad", scores: { performance: 0.7, accessibility: 0.96 } },
    ];
    const r = summarize(entries, TH) as Summary;
    const bad = r.perUrl.find((x: { url: string }) => x.url === "/bad");
    expect(bad).toBeDefined();
    expect(bad!.performance.pass).toBe(false);
    expect(r.pass).toBe(false);
  });
  it("run lỗi (null) không kéo median xuống — median 2 run còn lại", () => {
    const entries = [
      { url: "/x", scores: { performance: null, accessibility: 0.96 } },
      { url: "/x", scores: { performance: 0.9, accessibility: 0.96 } },
      { url: "/x", scores: { performance: 0.92, accessibility: 0.96 } },
    ];
    const r = summarize(entries, TH) as Summary;
    expect(r.perUrl[0].performance.median).toBe(0.91);
    expect(r.pass).toBe(true);
  });
  it("entries rỗng → perUrl rỗng, pass false (không có gì để PASS)", () => {
    const r = summarize([], TH) as Summary;
    expect(r.perUrl).toHaveLength(0);
    expect(r.pass).toBe(false);
  });
});

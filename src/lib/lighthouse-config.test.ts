import { describe, expect, it } from "vitest";
import {
  effectiveThresholds,
  isReportOnly,
  LH_THRESHOLDS,
  LH_OUT_DIR_DEFAULT,
  resolveOutDir,
} from "./lighthouse-config";

/**
 * Contract flag report-only + LH_OUT_DIR cho scripts/lighthouse.mjs
 * (SF-1 task 8 — spec VU-24 §5.4 + plan-critic P0-3):
 * - report-only CHỈ nới perf; a11y ≥0.95 vẫn HARD exit.
 * - OUT_DIR default GIỮ NGUYÊN evidence sf-8 (provenance VU-15 — chạy pre
 *   giờ không được GHI ĐÈ); override qua LH_OUT_DIR.
 */

describe("lighthouse-config resolveOutDir", () => {
  it("default = evidence sf-8 (không env) — provenance VU-15 nguyên vẹn", () => {
    expect(resolveOutDir({})).toBe(LH_OUT_DIR_DEFAULT);
    expect(LH_OUT_DIR_DEFAULT).toBe(
      "docs/superpowers/evidence/sf-8-production-audit/lighthouse",
    );
  });

  it("LH_OUT_DIR override đường dẫn evidence khác", () => {
    expect(resolveOutDir({ LH_OUT_DIR: "docs/superpowers/evidence/qa-hardening/lighthouse" })).toBe(
      "docs/superpowers/evidence/qa-hardening/lighthouse",
    );
  });

  it("LH_OUT_DIR rỗng/whitespace → fallback default", () => {
    expect(resolveOutDir({ LH_OUT_DIR: "" })).toBe(LH_OUT_DIR_DEFAULT);
    expect(resolveOutDir({ LH_OUT_DIR: "   " })).toBe(LH_OUT_DIR_DEFAULT);
  });
});

describe("lighthouse-config isReportOnly", () => {
  it("unset → false (default hành vi hard-gate như SF-8)", () => {
    expect(isReportOnly({})).toBe(false);
  });

  it("nhận 1/true/yes (case-insensitive)", () => {
    for (const v of ["1", "true", "TRUE", "Yes", "yes"]) {
      expect(isReportOnly({ LH_REPORT_ONLY: v })).toBe(true);
    }
  });

  it("giá trị khác / rỗng → false", () => {
    for (const v of ["0", "false", "no", "", "report"]) {
      expect(isReportOnly({ LH_REPORT_ONLY: v })).toBe(false);
    }
  });
});

describe("lighthouse-config effectiveThresholds — report-only CHỈ nới perf", () => {
  it("hard mode: ngưỡng gốc nguyên vẹn (perf 0.85, a11y 0.95)", () => {
    expect(effectiveThresholds(false)).toEqual(LH_THRESHOLDS);
    expect(effectiveThresholds(false)).toEqual({
      performance: 0.85,
      accessibility: 0.95,
    });
  });

  it("report-only: perf NỚI (0), a11y VẪN HARD 0.95", () => {
    const t = effectiveThresholds(true);
    expect(t.performance).toBe(0);
    expect(t.accessibility).toBe(0.95);
  });
});

/**
 * Config thuần cho scripts/lighthouse.mjs — tách module để TDD được trong
 * lane vitest chính (script là top-level runner, không import được).
 *
 * SF-1 task 8 (spec VU-24 §5.4 + plan-critic P0-3):
 * - Flag report-only (`LH_REPORT_ONLY`): CHỈ nới perf — a11y ≥0.95 vẫn HARD
 *   exit (SF-6 prod perf không được tự động FAIL story không đụng perf).
 * - `LH_OUT_DIR`: override thư mục evidence; default GIỮ NGUYÊN dir sf-8
 *   (provenance VU-15 — chạy `pre` sau này không được GHI ĐÈ lên đó).
 */

export const LH_THRESHOLDS = { performance: 0.85, accessibility: 0.95 } as const;

export const LH_OUT_DIR_DEFAULT =
  "docs/superpowers/evidence/sf-8-production-audit/lighthouse";

type Env = Record<string, string | undefined>;

export function resolveOutDir(env: Env = process.env): string {
  const v = env.LH_OUT_DIR?.trim();
  return v || LH_OUT_DIR_DEFAULT;
}

export function isReportOnly(env: Env = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.LH_REPORT_ONLY?.trim() ?? "");
}

export function effectiveThresholds(reportOnly: boolean): {
  performance: number;
  accessibility: number;
} {
  // report-only: perf ngưỡng 0 (luôn pass — đo được là đủ, sụt được root-cause
  // trong report); a11y giữ nguyên ngưỡng hard.
  return reportOnly
    ? { performance: 0, accessibility: LH_THRESHOLDS.accessibility }
    : { ...LH_THRESHOLDS };
}

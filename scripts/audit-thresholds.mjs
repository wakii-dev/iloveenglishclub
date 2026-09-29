/**
 * Thresholds module SF-8 (plan T2) — logic ngưỡng binary §9 của
 * scripts/lighthouse.mjs, tách pure để test được (vitest.audit.config.ts)
 * mà không cần chạy Lighthouse/Chrome.
 *
 * Score Lighthouse 0-1; ngưỡng epic: a11y ≥ 0.95, perf mobile ≥ 0.85.
 * Protocol: N=3 runs/URL → MEDIAN per category so ngưỡng (chống cherry-pick).
 */

/**
 * Ngưỡng binary: score >= min → pass. score null/undefined (run lỗi) → fail.
 * @param {number|null|undefined} score
 * @param {number} min
 * @returns {boolean}
 */
export function evalCategory(score, min) {
  if (typeof score !== "number" || Number.isNaN(score)) return false;
  return score >= min;
}

/**
 * Median của mảng score, LOẠI null/undefined (run lỗi) trước — median của
 * phần còn lại; mảng trống/toàn null → null (không chia 0).
 * @param {Array<number|null|undefined>} scores
 * @returns {number|null}
 */
export function median(scores) {
  const valid = (scores ?? []).filter(
    (s) => typeof s === "number" && !Number.isNaN(s),
  );
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tổng hợp entries (1 entry = 1 run: {url, scores: {performance, accessibility}})
 * theo URL → median per category so thresholds ({performance, accessibility})
 * → { perUrl: [{url, performance: {median, pass}, accessibility: {median, pass}}],
 *     pass: boolean } (pass === false khi entries rỗng — không có gì để PASS).
 * @param {Array<{url: string, scores: Record<string, number|null>}>} entries
 * @param {Record<string, number>} thresholds
 */
export function summarize(entries, thresholds) {
  const byUrl = new Map();
  for (const entry of entries ?? []) {
    const list = byUrl.get(entry.url) ?? [];
    list.push(entry.scores ?? {});
    byUrl.set(entry.url, list);
  }
  const perUrl = [];
  let pass = true;
  for (const [url, scoreList] of byUrl) {
    const row = { url };
    for (const category of Object.keys(thresholds)) {
      const med = median(scoreList.map((s) => s[category]));
      const ok = evalCategory(med, thresholds[category]);
      row[category] = { median: med, pass: ok };
      if (!ok) pass = false;
    }
    perUrl.push(row);
  }
  if (perUrl.length === 0) pass = false;
  return { perUrl, pass };
}

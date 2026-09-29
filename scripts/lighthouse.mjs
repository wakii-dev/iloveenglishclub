#!/usr/bin/env node
/**
 * SF-8 Lighthouse audit runner (plan T3) — ngưỡng binary epic §9:
 *   accessibility ≥ 0.95 · performance ≥ 0.85 (mobile profile mặc định CLI
 *   — emulated Moto G Power, simulated slow-4G + 4× CPU throttle).
 *
 * Protocol (spec §4.1, chống cherry-pick): N=3 runs/URL → MEDIAN per
 * category so ngưỡng, qua summarize() của audit-thresholds.mjs (T2 —
 * module đã TDD). Exit non-0 khi median dưới ngưỡng.
 *
 * Dùng: node scripts/lighthouse.mjs <pre|final> [base-url]
 *   pre   — extracted core JSON mỗi run (evidence baseline trước fix)
 *   final — thêm FULL raw lighthouse JSON 1 file/URL (lượt quyết định
 *           verdict; ~600KB/file — size đã cân nhắc, ghi report)
 *
 * Điều kiện: `next start` ĐANG CHẠY trên base-url (build prod — KHÔNG chạy
 * dev). Guard: /en phải 200 + HTML KHÔNG chứa dev-indicator (nếu thấy dev
 * server → abort, không đo để evidence không nhiễm).
 * Lighthouse: `npx -y lighthouse@12` (pin version) + CHROME_PATH Google
 * Chrome app; fail 1 lần → retry 1; fail 2 → exit 2 (URL đó null, median
 * của run còn lại — trung thực trong summary).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { summarize } from "./audit-thresholds.mjs";

const LABEL = process.argv[2];
const BASE = (process.argv[3] ?? "http://localhost:3110").replace(/\/$/, "");
const RUNS = 3;
const THRESHOLDS = { performance: 0.85, accessibility: 0.95 };
const URLS = [
  "/en",
  "/vi",
  "/en/books",
  "/en/books/level-3",
  "/en/books/level-3/units/1",
  "/en/books/level-3/units/1/lessons/1/listen-and-type",
  "/vi/books/level-3/units/1/lessons/1/listen-and-type",
];
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LH_VERSION = "12";
const OUT_DIR =
  "docs/superpowers/evidence/sf-8-production-audit/lighthouse";

if (LABEL !== "pre" && LABEL !== "final") {
  console.error("Dùng: node scripts/lighthouse.mjs <pre|final> [base-url]");
  process.exit(2);
}

async function guard() {
  let res;
  try {
    res = await fetch(`${BASE}/en`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error(`ABORT: server ${BASE} không truy cập được — spawn \`next start\` trước (build prod, KHÔNG dev).`);
    process.exit(2);
  }
  if (res.status !== 200) {
    console.error(`ABORT: /en trả ${res.status} (cần 200).`);
    process.exit(2);
  }
  const html = await res.text();
  if (html.includes("__nextDevIndicator")) {
    console.error("ABORT: server là DEV (dev-indicator trong HTML) — evidence phải đo trên build prod. Spawn `next start`.");
    process.exit(2);
  }
}

const slug = (u) => u.replace(/^\//, "").replace(/[/?&=]/g, "_") || "home";

function runLighthouse(url, outFile) {
  const args = [
    "-y",
    `lighthouse@${LH_VERSION}`,
    `${BASE}${url}`,
    "--only-categories=performance,accessibility",
    "--output=json",
    `--output-path=${outFile}`,
    `--chrome-flags=--headless=new`,
    "--quiet",
  ];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      execFileSync("npx", args, {
        env: { ...process.env, CHROME_PATH: CHROME },
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 180_000,
      });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      console.log(`    retry (lần 1 fail: ${String(err).slice(0, 80)})`);
    }
  }
}

function extractCore(report, url, runIdx) {
  const failing = Object.entries(report.audits ?? {})
    .filter(([, a]) => a.score !== null && a.score < 1)
    .map(([id, a]) => ({ id, score: a.score, title: a.title }));
  return {
    url,
    run: runIdx,
    fetchTime: report.fetchTime,
    categories: Object.fromEntries(
      Object.entries(report.categories ?? {}).map(([k, v]) => [k, v.score]),
    ),
    metrics: Object.fromEntries(
      [
        "first-contentful-paint",
        "largest-contentful-paint",
        "total-blocking-time",
        "cumulative-layout-shift",
        "speed-index",
      ].map((k) => [k, report.audits?.[k]?.displayValue ?? null]),
    ),
    failingAudits: failing,
  };
}

await guard();
mkdirSync(OUT_DIR, { recursive: true });
const tmp = `${OUT_DIR}/.tmp-run.json`;
const entries = [];

for (const url of URLS) {
  process.stdout.write(`${url} `);
  for (let run = 1; run <= RUNS; run++) {
    try {
      runLighthouse(url, tmp);
      const report = JSON.parse(readTmp(tmp));
      const core = extractCore(report, url, run);
      writeFileSync(
        `${OUT_DIR}/${slug(url)}-${LABEL}-r${run}.json`,
        `${JSON.stringify(core, null, 2)}\n`,
      );
      if (LABEL === "final" && run === Math.ceil(RUNS / 2)) {
        // Full raw: 1 file/URL ở run giữa lượt final (lượt verdict) —
        // median run trung đại diện; size cân nhắc (report ghi)
        writeFileSync(
          `${OUT_DIR}/${slug(url)}-${LABEL}-full.json`,
          `${JSON.stringify(report)}\n`,
        );
      }
      entries.push({
        url,
        scores: {
          performance: core.categories.performance,
          accessibility: core.categories.accessibility,
        },
      });
      process.stdout.write(
        `p${Math.round((core.categories.performance ?? 0) * 100)}/a${Math.round((core.categories.accessibility ?? 0) * 100)} `,
      );
    } catch (err) {
      // run lỗi → không push entry; median của run còn lại (summarize loại null)
      console.log(`    RUN FAIL: ${String(err).slice(0, 120)}`);
    }
  }
  process.stdout.write("\n");
}
rmSync(tmp, { force: true });

const result = summarize(entries, THRESHOLDS, URLS);
writeFileSync(
  `${OUT_DIR}/summary-${LABEL}.json`,
  `${JSON.stringify({ base: BASE, thresholds: THRESHOLDS, runsPlanned: RUNS, ...result }, null, 2)}\n`,
);
// review P1 — URL mất HẾT run ≠ PASS (fail-closed tường minh, exit 2 riêng)
const unmeasured = result.perUrl
  .filter((row) => row.performance.median === null && row.accessibility.median === null)
  .map((row) => row.url);
if (unmeasured.length) {
  console.error(
    `URL UNMEASURED (mất hết run — không được tính PASS): ${unmeasured.join(", ")}`,
  );
  process.exit(2);
}

console.log(`\n== KẾT QUẢ (${LABEL}) — median/${RUNS} runs, ngưỡng a11y≥${THRESHOLDS.accessibility} perf≥${THRESHOLDS.performance} ==`);
for (const row of result.perUrl) {
  const fmt = (c) =>
    `${(c.median * 100).toFixed(1)} ${c.pass ? "PASS" : "FAIL"}`;
  console.log(
    `${row.url.padEnd(58)} perf ${fmt(row.performance)} | a11y ${fmt(row.accessibility)}`,
  );
}
console.log(result.pass ? "\nTỔNG: PASS" : "\nTỔNG: FAIL — median dưới ngưỡng");
process.exit(result.pass ? 0 : 1);

function readTmp(file) {
  return readFileSync(file, "utf8");
}

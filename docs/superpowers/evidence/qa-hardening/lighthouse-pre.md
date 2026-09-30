# Lighthouse pre baseline — SF-1 task 9

Chạy: `LH_OUT_DIR=docs/superpowers/evidence/qa-hardening/lighthouse node scripts/lighthouse.mjs pre http://localhost:3300`
Server: `next start` build prod (PORT 3300 — build task 3) · Chrome: Google Chrome headless · protocol median/3 runs (giữ SF-8) · Date 30-09.

## Kết quả 7/7 PASS (exit 0)

| URL | perf (median) | a11y (median) |
|---|---|---|
| /en | 92.0 | 100.0 |
| /vi | 90.0 | 100.0 |
| /en/books | 91.0 | 98.0 |
| /en/books/level-3 | 94.0 | 100.0 |
| /en/books/level-3/units/1 | 95.0 | 100.0 |
| /en/books/level-3/units/1/lessons/1/listen-and-type | 92.0 | 100.0 |
| /vi/books/level-3/units/1/lessons/1/listen-and-type | 91.0 | 100.0 |

Ngưỡng hard: a11y ≥0.95 (PASS toàn bộ, thấp nhất 98) · perf ≥0.85 (PASS, thấp nhất 90) — mode mặc định (reportOnly: false trong summary-pre.json; flag report-only là cho SF-6 prod perf).

## Exit criterion phụ — provenance VU-15

- `git status --porcelain docs/superpowers/evidence/sf-8-production-audit/` → **0 file dirty** — evidence SF-8 KHÔNG bị đụng (LH_OUT_DIR làm việc đúng: 22 file (21 run + summary) nằm ở `qa-hardening/lighthouse/`).
- Đây chính là P0-3 (plan-critic): không có LH_OUT_DIR thì chạy pre này đã GHI ĐÈ evidence SF-8.

## Baseline so về sau

SF-6 `lighthouse-final-local` so với các số này (perf 90–95 / a11y 98–100 local); prod perf dùng flag `LH_REPORT_ONLY=1` + root-cause mọi mức sụt.

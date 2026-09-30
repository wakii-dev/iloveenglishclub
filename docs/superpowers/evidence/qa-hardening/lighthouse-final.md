# Lighthouse FINAL local — SF-6 (task 5, hard gate trước khi đo prod)

- **Chạy:** 30-09-2026, HEAD `40b56ec` (branch `wakii-dev/sf-6-prod-qa`), build prod
  `next build` GREEN (QA-503 fix hiệu lực) + `next start` :3110 — guard script chặn dev-build.
- **Protocol:** `node scripts/lighthouse.mjs final` — 7 URL, median/3 runs, mobile throttled,
  Chrome headless (LH 12.8.2, mobile emulation); **hard gate a11y ≥ 0.95 + perf ≥ 0.85**.
- **Kết quả: 7/7 PASS (exit 0)** — evidence raw JSON + `summary-final.json` cùng thư mục
  `lighthouse/` (pattern `-final-r{1,2,3}.json` + `-final-full.json` 1 file/URL).

| URL | perf (median) | a11y (median) | PASS |
|---|---|---|---|
| /en | 0.92 | 1.00 | ✅ |
| /vi | 0.90 | 1.00 | ✅ |
| /en/books | 0.91 | 0.98 | ✅ |
| /en/books/level-3 | 0.94 | 1.00 | ✅ |
| /en/books/level-3/units/1 | 0.94 | 1.00 | ✅ |
| /en/books/level-3/units/1/lessons/1/listen-and-type | 0.92 | 1.00 | ✅ |
| /vi/books/level-3/units/1/lessons/1/listen-and-type | 0.91 | 1.00 | ✅ |

**Đối chiếu baseline pre (SF-8 gốc, `summary-pre.json`, đo ở :3300 trước story):** mọi URL
final ≥ pre (perf 90-94 vs 90-94, a11y 98-100 vs 98-100) — AC#5 "local final ≥ baseline"
đạt, không có regression hiệu năng từ các fix SF-2..5.

## Ghi chú vận hành

- 2 lần `spawnSync npx ETIMEDOUT` (npx cold) — script tự retry, đủ 3 runs/URL, không ảnh hưởng median.
- Lần chạy trước (29-09 đêm) chết giữa chừng ở URL cuối → chỉ 6/7 file; run này đo LẠI toàn bộ
  7 URL trên HEAD mới nhất, ghi đè file cũ (provenance: commit này).
- Prod lighthouse (task 6) **BLOCKED GAP #3** — chưa có URL prod + chưa trả lời (a)/(b). Khi có:
  chạy cùng protocol với `LH_REPORT_ONLY=1` (perf report-only + root-cause sụt so với bảng trên;
  a11y ≥ 0.95 VẪN hard — spec VU-24 §5.4).

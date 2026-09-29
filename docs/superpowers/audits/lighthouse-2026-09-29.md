# Lighthouse Audit — SF-8 Production + audit (VU-23)

Date: 2026-09-29 | Story: VU-15 | Worktree: `sf-8-production-audit`
Ngưỡng contract epic §9 (binary): **accessibility ≥ 95 · performance mobile ≥ 85**
Verdict: **PASS — 7/7 URL đạt ngưỡng (median/3 runs), exit 0** · `FINAL2-EXIT=0`

## Điều kiện đo (trung thực)

- **Build production thật**: `next build` (turbopack) + `next start -p 3110` — KHÔNG phải dev server (runner guard dev-indicator `__nextDevIndicator`, thấy dev → abort)
- **Lighthouse** `npx -y lighthouse@12` (pin version) + Google Chrome app (`CHROME_PATH`), `--only-categories=performance,accessibility`, profile mobile mặc định CLI (emulated Moto G Power, **simulated slow-4G + 4× CPU throttle — kể cả trên localhost**)
- **Protocol**: 3 runs/URL → **median** so ngưỡng (chống cherry-pick); fix xong re-chạy cùng protocol; mọi raw JSON giữ `docs/superpowers/evidence/sf-8-production-audit/lighthouse/` (51 file, ~3.2MB: 14 core JSON/lượt + `summary-{pre,final}.json` + 7 full raw lượt final ~600KB/file — size đã cân nhắc)
- **Hạn chế trung thực**: localhost loại TTFB/CDN/network thật → điểm local là **xấp xỉ tối ưu**; prod thật (Vercel + network người dùng) có thể thấp hơn. Audit này chứng minh không có defect trong app; audit prod URL thuộc post-deploy checklist `docs/deploy.md`.
- **Locale lệch**: home + lesson đo cả en/vi (2 locale x 2 trang); books/book/unit chỉ en — cùng component/token, locale đổi text không đổi layout/score bề mặt.

## Kết quả FINAL (median/3) — build sau fix

| URL | perf (≥85) | a11y (≥95) | Verdict |
|---|---|---|---|
| `/en` | 93 | **100** | PASS |
| `/vi` | 91 | **100** | PASS |
| `/en/books` | 95 | **98** | PASS |
| `/en/books/level-3` | 95 | **100** | PASS |
| `/en/books/level-3/units/1` | 95 | **100** | PASS |
| `…/lessons/1/listen-and-type` (en) | 94 | **100** | PASS |
| `…/lessons/1/listen-and-type` (vi) | 92 | **100** | PASS |

Perf metrics đại diện (/en): FCP 0.9s · LCP 3.9s (simulated slow-4G) · TBT 20ms · CLS 0 · SI 1.1s.

## Baseline PRE-fix (median/3) — trước fix, `PRE-EXIT=1`

a11y **94.0 FAIL cả 7 URL** · perf 92–95 PASS cả 7. Root causes (Lighthouse color-contrast + heading-order):

| # | Finding | Fix (contrast verify số học WCAG) |
|---|---|---|
| 1 | Button primary `#e85d3d`/kem = 3.29:1; `text-secondary` `#0e9488` = 3.55:1 | `--primary` → `#c2482e` (4.68:1) · `--secondary` → `#0b756d` (5.27:1) — `globals.css`, light theme |
| 2 | LevelCard band màu sách + badge `white/22`: trắng trên `#f59e0b` = 2.1:1 | band `color-mix(in srgb, ${color} 60%, black)` + badge `bg-black/30` → ≥5.41:1 mọi level |
| 3 | Footer `h4` không tuần tự (sau `h1` = skip cấp) | `h4→h3` — chưa đủ ở trang chỉ có `h1` (vẫn skip) → **`h3→h2`** (round 2) |
| 4 | BookCover `opacity-90` trên raw color = ~3.4:1 | Cover `color-mix 60%` (giữ opacity-90) → ≥4.73:1 worst-case |
| 5 | Pill start-gate/results `bg-secondary/14` = 4.35:1 (thiếu 4.5) | tint → `bg-secondary/8` = 4.74:1 |

Fix vòng 1: 4/7 URL lên 98–100; vòng 2: **7/7 PASS**. Tổng ~11 dòng / 5 file — trong ngưỡng convergence (≤10 dòng logic; 5 dòng là comment giải thích).

## Tái chạy

```bash
npm run build && (npx next start -p 3110 &)   # build prod
node scripts/lighthouse.mjs final http://localhost:3110   # exit 0 = đạt ngưỡng
```
Threshold logic: `scripts/audit-thresholds.mjs` (TDD — `npm run test:audit`).

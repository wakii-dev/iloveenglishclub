# E2E flakiness audit — SF-1 task 7

Đo: mỗi config ×3 runs liên tiếp trên HEAD `47f07e0` (sau regression test), port sạch, `retries:0`. Date 30-09.

## Số đo

| Config | Run 1 | Run 2 | Run 3 | Kết luận |
|---|---|---|---|---|
| **dictation** (`playwright.config.ts`, port 3110) | 11/11 (39.2s) | 11/11 (38.3s) | 11/11 (38.1s) | **Ổn định 3/3** — 0 flaky |
| **admin** (`playwright.admin.config.ts`, port 3000) | 6/6 (29.6s) | 6/6 (29.4s) | ⚠️ **webServer crash trước khi test chạy** (0 ✘, 0 ✓, không summary) → **retry: 6/6** (28.8s) | **Test-level ổn định 3/3** (mọi run hoàn tất đều 6/6); 1/4 lần start dev-server bị crash |

Baseline run từ task 2 (trước audit): dictation 11/11, admin 6/6 — cộng dồn: **dictation 44/44, admin 18/18 test-pass trên 4 run mỗi config.**

## Flake thật duy nhất — QA-7 (P1): Turbopack dev + next/font/google race lúc webServer startup

- **Repro**: `npm run test:e2e` (webServer `next dev --turbopack`) → server chết lúc khởi động:
  `NextFontGoogleFontFileReplacer … "next/font/google queries have exactly one entry"` — import trace `nunito` qua `src/app/(public)/[locale]/layout.tsx`. Tần suất đo: **1/4 lần start** (admin r3; các start khác OK).
- **Root cause**: race resolve import-map font trong Turbopack dev (cùng class bug `4d95320` đã fix cho **build** — build không turbopack rồi, **dev vẫn turbopack**). Không phải test flake: 0 test chạy, suite fail trắng.
- **Impact**: `retries:0` không cứu được (fail ở tầng webServer); runner nhìn thấy FAIL rõ (không silent). Rate 1/7 lần start đo được trong session này (4 admin + 3 dictation start).
- **Ứng viên được dự báo trước (cold compile action 60-115s sát timeout 60s): KHÔNG hiện thực** — mọi test hoàn tất ≤ 8.8s (admin) / ≤ 39s (suite dictation), 0 action timeout sau khi port sạch (QA-2).
- **Owner**: infra — tier-1. Lựa chọn fix (PM quyết, SF-1 không sửa vì: `dev` script dùng chung toàn team + 2 baseline config là READ-ONLY boundary):
  1. Chấp nhận + retry run (hiện trạng, fail trắng rõ ràng, không silent);
  2. Bỏ `--turbopack` khỏi `dev` script (ổn định, mất HMR nhanh);
  3. Next 16 upgrade (đã có trong Recommendations story) — đích đúng lâu dài.

## Quyết theo tiêu chí context pack

Cả 2 lane **PASS ≥2/3 runs = xanh** (dictation 3/3, admin 3/3 test-level). Lane KHÔNG bị chặn; QA-7 ghi findings-sf1.md kèm owner tier-1.

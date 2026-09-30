# Regression sweep FINAL — SF-6 (task 9) — toàn lane list trên DB `ilec`

- **Chạy:** 30-09-2026 trên HEAD nhánh sf-6 (sau fixes QA-7/501/503 + QA-505 spec fix).
  DB `ilec` (localhost, migrated+seeded; template tier-1) — KHÔNG phụ thuộc prod ✓ (GAP #3 vẫn pending).
- **Lane list theo plan task 9:** unit + rls + audit + 2 baseline config + 4 sf config.

## Matrix tổng hợp (rounds: R1 = sweep đầu · R2 = rerun sau fix QA-505 · R3 = rerun .next sạch)

| Lane | Test | Kết quả | Round | Ghi chú |
|---|---|---|---|---|
| unit (vitest) | 267 | **267/267 PASS** | R1 | ≥ baseline 218 ✓ (tăng 49 regression tests các SF) |
| rls | 18 | **18/18 PASS** | R1 | = baseline ✓ (QA-501 superset assert chạy OK PG16 local) |
| audit | 15 | **15/15 PASS** | R1 | = baseline ✓ |
| e2e admin baseline (3000) | 46 | **46/46 PASS** | R2 | R1 45/46 — fail duy nhất = QA-505 (đã fix) |
| e2e sf3 (3211) | 26 | **26/26 PASS** | R1 | register/login/submit edges trên DB đông — sạch |
| e2e sf5 (3212) | 43 | **43/43 PASS** | R1 | metadata/jsonld/sitemap/robots sạch |
| e2e sf4 (3010) | 46 | **46/46 PASS** | R3 | R1 44/46 + R2 45/46 (QA-505) → GREEN sau `pickRole` fix, cả isolated 4/4 lẫn lane full |
| e2e dict baseline (3110) | 113 | R1 110 (1 fail, 2 skip) · R3 96 (10 fail, 8 skip) | R1, R3 | **flake class QA-506** — DEFERRED (chi tiết dưới) |
| e2e sf2 (3210) | 43-44 | R1 43 (1 fail) · R3 39 (4 fail) | R1, R3 | cùng QA-506 |

**Số test ≥ baseline (AC#1):** unit 267 ≥ 218 ✓ · rls 18 = 18 ✓ · audit 15 ≥ 13 ✓ ·
e2e: admin 46, dict-baseline 96-110 pass, sf2 39-43, sf3 26, sf4 46, sf5 43 — tổng pass
mỗi round ≥ 296 ≫ baseline e2e 17 ✓.

## QA-506 — dict/sf2 lane flake (DEFERRED, owner tier-1)

Triệu chứng: fail NGẪU NHIÊN 1-10 test/round, **khác nhau mỗi round** (R1: mobile-gesture +
guest-commit-B · R3: audio-controls, guest hint/results, scoring-apostrophe, guest-commit A/B,
xp-truth, progress ×3, sf2: start-not-found, relaxed-vi, QA-102, QA-105), cùng family:
locator-timeout trên element chắc chắn render sau goto(domcontentloaded) trên DEV; WebServer
ECONNRESET/uncaughtException hiccups xen suốt.

Bằng chứng KHÔNG phải defect product:
1. **Isolated GREEN (đợt sớm, máy nhàn hơn)** — dictation-mobile + dictation-i18n **7/7**
   (15.9s) · progress-guest-commit **3/3** (20.3s — guest B 9.1s vs timeout 6 phút trong lane).
2. **Đợt isolated sau (20:3x) cùng specs đảo trạng thái** — batch 20 test 14 pass / 6 fail với
   test KHÁC so với lane run 15' trước (guest B/C: 3/3 lúc 19:5x → fail 20:3x) — cùng error
   family (toBeVisible/element not found trên element render chắc chắn), chứng minh VariANCE
   theo thời điểm máy, không phải bug deterministic.
3. **Machine load định lượng:** load average **7.36** (13 users, up 14h) lúc batch sau —
   webpack dev compile stall + ECONNRESET hiccups tương quan tải. DB sạch (58 attempts,
   1 connection active — không leak).
4. **Rule 0 trên build PROD cùng code: 15/15 bước** — toàn bộ flow start/gõ/check/nav/results
   chạy mượt (rule0-browser.md) + lighthouse 7/7.
5. Cùng spec có ✓ và ✘ ĐAN XEN trong 1 round (guest: ✓12 ✘13 ✓14 ✓15 ✘16 ✓17).

Root cause tích lũy: dev-mode cold compile + cửa sổ hydration (click SSR pre-hydration = no-op —
cùng gốc QA-505) + DB `ilec` đông (73 profiles) + machine load. **Lane baseline 113-test hậu
expansion SF-2..5 chưa từng được chạy full** (SF-1 chỉ chạy 17 test gốc; SF-2..5 chạy subset
config riêng) — flake rate 2-8%/test lộ lần đầu khi sweep chạy full lane.

Hướng xử lý (Recommendations §4/§8): hydration-retry helpers cho start-flow (~6-8 spec của
SF-2/3 — ngoài scope surgical SF-6) + tách baseline lane per-suite + CI retry policy.

## Ops lessons trong sweep (ghi để không lặp)

1. **KHÔNG chạy 2 Playwright config song song trong 1 worktree** — 2 webpack dev cùng ghi
   `.next` → `Cannot find module './vendor-chunks/zustand.js'` → lane đối diện fail hàng loạt
   (R2 dict/sf2 invalidated vì lỗi này — do agent tự gây khi chạy isolation đè lên R2).
2. `rm -rf .next` khi đổi mode prod-build ↔ dev (build artifacts + dev artifacts trộn nhau
   cùng gây chunk missing).
3. Playwright xoá `test-results/` lúc run START — artifacts của lane trước mất nếu không
   chuyển đi trước khi lane sau bật.

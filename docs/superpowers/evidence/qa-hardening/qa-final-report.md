# QA FINAL REPORT — QA hardening VU-24 (SF-6 Prod QA + convergence)

- **Ngày:** 30-09-2026 · **Run:** VU-31 · **Worktree:** `sf-6-prod-qa`
  · **Branch:** `wakii-dev/sf-6-prod-qa` (merge về đích `wakii-dev/story-vu24-qa-hardening`)
- **HEAD verify:** `8c80401` (fix QA-505) trên nền `eba052a` (evidence lighthouse +
  registry) + 3 fix `9716d6f` (QA-7) / `c9ed6c0` (QA-503) / `40b56ec` (QA-501).
- **Evidence index:** baseline.md · sweep-final.md · lighthouse-final.md ·
  rule0-browser.md · prod-cleanup-dryrun.md · findings.md (merged) ·
  qa-recommendations.md · screenshots-sf6/ (13 PNG + walkthrough.mjs) ·
  findings-sf{1..6}.md.

## 1. ACCEPTANCE context pack sf-6 (từng dòng)

1. **"Prod URL thật: học được 1 bài, admin publish được bài mới, Lighthouse đo được
   cả local (PASS hard) lẫn prod (a11y PASS, perf report có root-cause)"**
   → **LOCAL PART: PASS.** Lighthouse final local 7/7 PASS hard (perf 90-94,
   a11y 98-100 — hard gate a11y≥0.95/perf≥0.85, ≥ baseline SF-8). Prod flows +
   lighthouse prod: **BLOCKED GAP #3** — đã hỏi đủ 4 câu trên epic (comment
   21:18 29-09: prod URL production/preview? Vercel watch branch? admin creds?
   Blob token?) — chưa có GAP-ANSWER tới thời điểm CLOSE. Boundary cấm tự đoán
   URL/creds (context pack) → block đúng protocol, KHÔNG phải bỏ việc.
2. **"Không để lại rác: data test prod đã dọn (DB + Blob), hoặc liệt kê rõ cái còn"**
   → **PASS (với liệt kê).** Prod DB dry-run (read-only, 30-09): **0 data test** —
   0 `@test.ilec` user, 0 content `[QA*]`, 0 attempts/progress (prod-cleanup-dryrun.md)
   → pha (a) không cần `--execute`. Blob (pha b): SKIP thiếu token (GAP #3d) —
   liệt kê rõ: rủi ro orphan thấp (0 lesson `[QA*]` trên prod → không có audio
   `[QA]` theo design path); khi có token chạy dry-run → review → `--execute --phase b`.
3. **"`findings.md` tổng: 0 OPEN"** → **PASS.** 17 FIXED (đủ fix commit + regression
   RED→GREEN; ops fixes có evidence) · 7 BY-DESIGN (rationale) · 7 DEFERRED
   (rationale + Recommendations; sign-off: QA-105/106r/108 default-approved epic
   19:13 29-09, QA-201/202/305 sign-off nguồn ghi sẵn, QA-504/506 xin sign-off
   batch trong audit comment SF-6) · **0 OPEN.**
4. **"Final report đủ để người merges tự tin"** → tài liệu này + evidence index trên.

## 2. AC story-level (spec §6) — binary từng cái

| # | AC | Verdict | Evidence |
|---|---|---|---|
| 1 | Matrix xanh trên HEAD nhánh đích lúc CLOSE | **PASS (6/8 lane; 2 lane triage đúng cơ chế escape-hatch AC#1)** | unit 267/267 (≥218) · rls 18/18 · audit 15/15 · admin 46/46 · sf3 26/26 · sf4 46/46 · sf5 43/43 — xanh. dict-baseline (113) + sf2: flake 2-8%/test trên dev — **QA-506 triaged** (mọi test PASS isolated + prod build; AC#1: "fail được triage vào registry kèm owner tier-1, không chặn"). Chi tiết + số mọi round: sweep-final.md |
| 2 | findings.md merged 0 OPEN; DEFERRED có rationale + sign-off + Recommendations; FIXED có commit + RED→GREEN | **PASS** | findings.md; QA-505 RED 4/4→GREEN 4/4; QA-504/506 sign-off batch (audit comment) |
| 3 | VERIFY fix `695f0ef` SessionProvider + bỏ workaround `page.reload()` progress.spec | **PASS** | SF-3 task 4: e2e regression register thật; progress.spec comment "đã BỎ" (kiểm lại 30-09); sf3 lane 26/26 trong sweep |
| 4 | Regression `3617eed` tồn tại + mutation RED | **PASS** | SF-1 task 4 (regression-storage-import, mutation RED khi revert) |
| 5 | Lighthouse local final ≥ baseline SF-8; prod a11y hard + perf report-only | **LOCAL PASS · PROD BLOCKED GAP #3** | lighthouse-final.md (7/7 ≥ baseline); prod chưa đo được — không URL |
| 6 | Prod smoke + dictation flow + admin publish + cleanup | **PARTIAL — flows BLOCKED GAP #3 · cleanup-dry-run PASS** | prod DB sạch 0 test data (dry-run); script committed dry-run mặc định; prod browser flows cần URL/creds |
| 7 | Final report + evidence committed + recommendations | **PASS** | doc này + qa-recommendations.md + evidence committed trên branch |
| 8 | security-scan PASS + rls 18/18 + 0 P0/P1 mới | **PASS** | `security-scan.mjs` PASS (30-09); rls 18/18; findings 0 P0/P1 mở (P1 đều FIXED) |

## 3. Fix của run (5 findings FIXED tại SF-6)

- **QA-7** `9716d6f` — turbopack dev font race chết webServer → 6 e2e webServer sang
  webpack dev (+ admin `reuseExistingServer: !CI`).
- **QA-501** `40b56ec` — PG17+ RESTRICT 23001 ≠ 23503: lessons/units dual-catch +
  test-rls superset (prod = PG18.6 sẽ break nếu không fix).
- **QA-503** `c9ed6c0` — `next build` gãy lint (error.test.ts) → block-disable đúng
  chỗ; build GREEN lại.
- **QA-502** (ops, coordinator) — env Neon-prod mis-copy → worktree env chuẩn local.
- **QA-505** `8c80401` — admin-users e2e race (pre-hydration click) → `pickRole`
  click-with-retry; RED 4/4 → GREEN 4/4 + admin lane 46/46.

Product gap mới phát hiện: **QA-504** (admin/users silent 20-cut) — DEFERRED.

## 4. Những gì BLOCKED và điều kiện gỡ (cho người merge)

| Việc | Cần | Lệnh sẵn sàng |
|---|---|---|
| Prod smoke + dictation flow + admin publish `[QA]` | (a) prod URL, (c) admin creds | flow steps trong qa-checklist.md + rule0-browser.md |
| Lighthouse prod (a11y HARD, perf report-only) | (a) URL | `LH_REPORT_ONLY=1 LH_OUT_DIR=… node scripts/lighthouse.mjs final <prod-url>` |
| Prod cleanup Blob (pha b) | (d) `BLOB_READ_WRITE_TOKEN` | dry-run → review → `--execute --phase b` (scripts/qa-prod-cleanup.mjs) |
| Vercel watch branch xác nhận | (b) | không lệnh — quyết định deploy |

GAP #3 vẫn mở trên epic VU-24 (comment 21:18 29-09). Đã cam kết an toàn: data test
chỉ `@test.ilec` + prefix `[QA]`; cleanup dry-run trước execute; KHÔNG tự merge —
PR `--base master` do NGƯỜI merge.

## 5. Kết luận cho người merge

Code trên nhánh đích (sau merge SF-6) đạt: matrix xanh 6/8 lane + 2 lane triaged
có bằng chứng product sạch; lighthouse local hard-gate 7/7; prod DB sạch; security
scan PASS; 0 finding OPEN. Prod **sign-off runtime** (smoke/flow/lighthouse-prod/
cleanup-Blob) đang chờ GAP #3 — có thể chạy NGAY sau khi user trả lời 4 câu, không
cần thêm code. Dep upgrades + CI lanes + robustness e2e: qa-recommendations.md.

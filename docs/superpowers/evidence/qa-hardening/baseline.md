# Baseline matrix — QA hardening SF-1 (task 2: matrix-rerun-baseline)

HEAD lúc chạy: `dae8ffc` (branch `wakii-dev/sf-1-qa-baseline`) · Date: 2026-09-29 → 2026-09-30 · Env: `.env.local` local `ilec` (xem [env-matrix.md](env-matrix.md))

## Số thật từng lane

| Lane | Lệnh | Kết quả | Ghi chú |
|---|---|---|---|
| **unit** | `npm test` (vitest.config) | ✅ **218/218** (18 files) | khớp baseline kỳ vọng 218 — 0 fail, 0 flaky signal |
| **rls** | `npm run test:rls` | ⚠️→✅ **18/18** | run 1: **17/18** — fail `getUnits draft ẩn với anon` do **data pollution** (xem QA-1); sau hygiene → 18/18 |
| **audit** | `npm run test:audit` | ✅ **15/15** (1 file) | khớp dải kỳ vọng ~13-15 |
| **e2e admin** | `npm run test:e2e` (port 3000) | ⚠️→✅ **6/6** (29.6s) | run 1: **1/6** — 5 fail do **stale dev server chiếm port** (xem QA-2); sau kill PID cũ → 6/6 |
| **e2e dictation** | `npm run test:e2e:dictation` (port 3110) | ✅ **11/11** (39.2s) | 0 fail run 1 (chạy SAU khi port đã sạch) |

**Tổng baseline: 218 unit · 18 rls · 15 audit · 17 e2e (6 admin + 11 dictation) = 268 test, tất cả PASS trên HEAD.**

Lane flaky (`retries:0`) — audit ×3 định lượng ở task 7; run đơn này chỉ là baseline số, chưa kết luận flakiness.

## 2 sự kiện hygiene trong baseline (bài học chính của task này)

### QA-1 — DB local `ilec` dơ content từ e2e cũ → rls fail
- **Repro**: `npm run test:rls` trên DB có unit `E2E Unit` (id 89, number 94, level-3, created 2026-09-29 18:22) → test `getUnits/getLessons: draft lesson ẨN với anon` expect `[1,2]` nhận `[1,2,94]`.
- **Root cause**: unit/lesson e2e admin (3 lessons, 11 parts, 0 attempts) TỒN DƯ sau run cũ — spec admin tạo unit `E2E Unit` không self-clean đủ (unit bị xoá... còn lesson? — unit + 3 lessons + 11 parts còn nguyên).
- **Đã xử lý**: DELETE FK-order (11 parts → 3 lessons → 1 unit) → rls 18/18.
- **Owner**: infra (SF-1 ghi nhận). Policy fix "spec e2e re-runnable trên DB bất kỳ / self-clean" là nhiệm vụ SF-4 (`triage-fix-e2e-expansion`, plan SF-4 task 1 P1-4) — không phải bug product; RLS hành vi đúng (draft vẫn ẩn; unit published hiển thị đúng thiết kế).
- **Impact SF-10 (db-template)**: template `ilec_sf2..sf5` phải tạo SAU khi `ilec` sạch — task 10 re-hygiene trước `createdb -T`.

### QA-2 — Stale dev server chiếm port config + `reuseExistingServer: true` → e2e chạy against app SAI
- **Repro**: `next-server` cũ từ worktree `story-vu15-iloveenglishclub` (start 23:34 29-09) listen port 3000 → `playwright.admin.config.ts` (`reuseExistingServer: true`) **reuse server đó** → login admin fail hàng loạt ("Email hoặc mật khẩu không đúng" dù bcrypt.compare(env, db_hash)=true — server khác DB khác), 5/6 test timeout 90s.
- **Root cause**: config baseline không phân biệt server của worktree NÀO đang nghe port — `reuseExistingServer: true` vô điều kiện. `next dev` tự nhảy port (3000→3001) khi bận nên dev server mới KHÔNG chặn việc này.
- **Đã xử lý**: kill PID 43508 (leftover — an toàn, ai cũng restart được) → re-run admin e2e 6/6.
- **Owner**: infra (SF-1). Fix config (`reuseExistingServer: !process.env.CI` + guard port/health-check theo worktree) — ** Boundary: KHÔNG sửa 2 baseline playwright configs trong SF-1** → khuyến nghị trong findings + SF-4/PM quyết. Số e2e mỗi SF sau phải chạy trên port config MỚI của SF đó (đã thiết kế: 3210/3211/3010/3212) — design này đúng chặn đúng class lỗi này.
- **Cross-check**: lesson memory "e2e port riêng mỗi SF" (SF-6 VU-15) đã gặp đúng class này — baseline lại dính vì port 3000/3110 là port chung của 2 config baseline.

## Kết luận task 2

Baseline xanh toàn lane sau 2 phép hygiene — KHÔNG có bug product mới nổi từ matrix. 2 finding infra (QA-1, QA-2) ghi registry `findings-sf1.md` (task 5). SF-2..5 dựa được vào các lane này trên DB/port riêng của mình.

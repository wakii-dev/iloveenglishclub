# Findings registry — SF-1 QA baseline + infra hygiene

Dải ID: **QA-1–99** (SF-2: 100–199 · SF-3: 200–299 · SF-4: 300–399 · SF-5: 400–499 · SF-6: 500+ — SF-6 merge tất cả về `findings.md`).

Row format (spec VU-24 §4): `QA-<n> | P0/P1/P2 | surface | repro | root cause | fix commit | regression test | status | evidence`.
Severity: P0 mất chức năng/security/data sai · P1 sai hành vi flow chính · P2 edge/cosmetic.
Mọi BY-DESIGN/DEFERRED bắt buộc rationale (chống misclassify — spec-critic P1-7).

## Findings

| ID | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-1 | P1 | infra/test-data | `npm run test:rls` trên DB `ilec` local có unit `E2E Unit` (id 89, number 94, level-3, created 29-09 18:22 từ run e2e admin cũ) → test "draft ẩn với anon" expect `[1,2]` nhận `[1,2,94]` | Spec e2e admin tạo unit/lesson không self-clean đủ → DB dơ chéo run, test rls có giả định seed sạch | (data hygiene, không phải code fix) DELETE FK-order 11 parts → 3 lessons → 1 unit | — (rls test có sẵn chính là detector) | **FIXED** | baseline.md §QA-1; prevention (spec re-runnable trên DB bất kỳ / self-clean) = acceptance có sẵn của SF-4 task 1, không cần bug riêng |
| QA-2 | P1 | infra/e2e-runner | `next-server` cũ từ worktree khác (story-vu15, start 23:34 29-09) listen port 3000 + `playwright.admin.config.ts` `reuseExistingServer: true` → 5/6 admin e2e timeout 90s với "Email hoặc mật khẩu không đúng" dù credential đúng (server khác DB khác) | Baseline config reuse server vô điều kiện — không phân biệt server của worktree nào; `next dev` tự nhảy port nên server mới không chặn | (ops) kill PID 43508 + e2e re-run 6/6 | — | **FIXED** | baseline.md §QA-2; khuyến nghị: `reuseExistingServer: !process.env.CI` + health-check theo worktree — SF-1 KHÔNG sửa baseline config (boundary); SF-2..5 đã có port riêng 3210/3211/3010/3212 chặn đúng class này |
| QA-7 | P1 | infra/e2e-runner | `npm run test:e2e` (webServer `next dev --turbopack`) → 1/4 lần start server chết: `NextFontGoogleFontFileReplacer … "next/font/google queries have exactly one entry"` (nunito, `src/app/(public)/[locale]/layout.tsx`); 0 test chạy, suite fail trắng | Race resolve import-map font trong Turbopack dev — cùng class bug `4d95320` đã fix cho build, dev vẫn turbopack. Ứng viên dự báo (cold compile 60-115s) KHÔNG hiện thực: mọi test ≤8.8s, 0 action timeout | (chưa fix — options 3 mục trong e2e-flakiness-audit.md: retry / bỏ --turbopack khỏi dev / Next 16) | — | **OPEN (owner tier-1, không chặn SF-1)** | e2e-flakiness-audit.md — admin 3/3 test-level xanh (run crash có retry 6/6), dictation 3/3 sạch; PASS ≥2/3 đạt |

## BY-DESIGN seed rows (pre-classified spec VU-24 §4 — SF surface re-verify khi QA)

| ID | Sev | Surface | Hành vi | Rationale | Status |
|---|---|---|---|---|---|
| QA-3 | P2 | dictation | Relaxed toggle giữa chừng lesson đổi mode check | By-design: toggle áp dụng ngay, không lock theo attempt — quyết định thiết kế VU-15 | **BY-DESIGN** |
| QA-4 | P2 | admin/split | Naive split-sentences viết tắt (Mr., e.g.) bị cắt sai | By-design v1: splitter regex đơn giản, manual fix trong editor là path chính thức | **BY-DESIGN** |
| QA-5 | P2 | public | Transcript/audio public không cần đăng nhập | By-design: nội dung core là free, auth chỉ để lưu tiến độ | **BY-DESIGN** |
| QA-6 | P2 | dictation | Guest commit chỉ sống 1 tab (sessionStorage) | By-design v1: guest progress in-memory/sessionStorage, mid-lesson commit là enhancement SF-3 QA | **BY-DESIGN** |

> Seed rows ở sf1 để registry sống từ task 5; SF-2/3/4 re-verify từng row trên surface mình (có quyền re-classify kèm rationale).

## Chưa có finding nào khác ở surface SF-1

Baseline matrix (baseline.md): unit 221/221 (218 gốc + 3 regression) · rls 18/18 · audit 15/15 · e2e 6+11/17 — toàn xanh sau 2 phép hygiene. Prod-build + smoke PASS (prod-build-verify.md). Flakiness audit (e2e-flakiness-audit.md): dictation 3/3, admin 3/3 test-level — duy nhất QA-7 còn OPEN (infra, owner tier-1, chờ PM triage: DEFERRED sign-off hoặc fix route).

# Findings registry — SF-4 Admin CMS + storage/upload

Dải ID: **QA-300–399** (contract: findings-sf1.md — row format spec VU-24 §4).

## Findings

| ID | Sev | Surface | Repro | Root cause | Fix commit | Regression test | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-300 | P2 | e2e infra (`playwright.admin.config.ts:13`) | `npx playwright test --config playwright.admin.config.ts --list` ở worktree tên chứa "admin-" (vd `sf-4-admin-cms-qa`) = **17 tests/4 files** (nhặt cả dictation/i18n/progress); ở `sf-1-qa-baseline` = 6 | Regex `/admin-.*\.spec\.ts/` KHÔNG anchor — Playwright match theo đường dẫn TUYỆT ĐỐI, chữ "admin-" trong tên thư mục worktree khớp mọi spec | N/A — baseline config out-of-scope (boundary SF-4); config mới `playwright.sf4.config.ts` dùng anchored `/admin-[^/]*\.spec\.ts$` (verify --list = 6) | `npx playwright test --config playwright.sf4.config.ts --list` = 6 (chạy lại được) | BY-DESIGN (baseline không sửa — ghi để SF-6 sweep không nhầm lane; admin lane trên worktree `admin-*` chạy thừa 11 test nhưng vẫn GREEN 17/17) | `--list` probe 2026-09-30, 2 worktree so sánh |
| QA-302 | P1 | Admin units (`src/lib/actions/admin/units.ts`) | (1) Tạo unit → public `/en/books/level-3` (unitCount + units list) stale tới 300s; (2) sửa title unit CÓ bài published → public unit page stale tới 300s — cả 2 vi phạm revalidate matrix VU-15 §5 "public stale ngay lúc write" (`getBook`/`getUnits` đếm TẤT CẢ units qua `unstable_cache` tag content) | `createUnitAction`/`updateUnitAction` thiếu `revalidateTag(CONTENT_TAG)` (delete có — asymmetric) | bc3038d..(fix commit) | `src/lib/actions/admin/units.test.ts` 2 test revalidate RED→GREEN (mock `next/cache`) + e2e `admin-units.spec.ts` probe #1a/#1b: public fresh NGAY, retry 0 | FIXED | RED: `Tests 2 failed (12)` lúc units.ts chưa fix; GREEN: `12 passed` + full suite 241/241; e2e 5/5 PASS |

> Chưa có finding. Ghi theo format trên; mọi BY-DESIGN/DEFERRED bắt buộc rationale. SF-6 merge tất cả về findings.md (AC#2: 0 OPEN).

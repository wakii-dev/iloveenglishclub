# Plan: SF-8 Production + audit (VU-23) — convergence epic VU-15
Date: 2026-09-29 | Linear: VU-23 | Worktree: `sf-8-production-audit` | Spec: `docs/superpowers/specs/2026-09-29-sf-8-production-audit-design.md`

## 0. Root cause analysis

**Root cause:** Epic contract §9/§10-M6 đòi chất lượng chứng minh bằng SỐ (Lighthouse a11y ≥95 / perf mobile ≥85 binary) + security checkpoint + deploy trước khi đưa cho người học thật. SF-1..7 build app nhưng chưa ai đo/cũng chưa ai khóa các lỗ hổng quy trình (merge SF-6 đã khôi phục `testMatch` dictation-only → 2/4 suite e2e mồ côi không config nào chạy).

**Current state (đã verify session này):** prod build XANH, mọi route public 200 trên `next start`; 218 unit tests xanh; `test:rls` 17/17 PASS; 4 e2e specs nhưng default config chỉ nhặt `dictation-*` (6), admin config chỉ `admin-*` (6) — `progress` + `i18n-switch` mồ côi; Lighthouse probe: perf 88–95 (PASS), a11y 94 đồng loạt (color-contrast + heading-order); npm audit 6 vulns (postcss-in-next, fix = Next 16 breaking); KHÔNG có audits/ + deploy docs; prod infra (remote Git/Vercel/BLOB token/Google OAuth) chưa có — blocker epic level.

**Expected outcome:** median Lighthouse ≥ ngưỡng từng trang (báo cáo + raw JSON); security checkpoint từng mục verdict có bằng chứng thật; smoke E2E 4/4 suite trên prod-build; deploy docs đủ để user tự deploy + REQUIREMENT-GAP liệt kê chính xác thứ còn thiếu.

**Constraints & hardships:** convergence — KHÔNG feature mới, fix ≤10 dòng (lớn hơn → report coordinator); repo KHÔNG remote — commit local, KHÔNG push/merge (human gate); prod URL thật bị chặn → phần đó KHÔNG fabricate.

**High-level strategy:** audit đo-trên-local-prod-build (được phép đo hết) + gap-closure nhỏ có bằng chứng + docs hoá phần prod; audit reports = vật chứng gate.

## 1. Problem
Người học thật chỉ được nhận sản phẩm khi: điểm Lighthouse đạt ngưỡng §9, bảo mật được checkpoint từng mục, deploy chạy thật. Hiện chưa có bất kỳ bằng chứng nào trong số đó — SF-8 là gate cuối của epic.

## 2. Scope
- **In:** prod-build xanh · Lighthouse (N=3/URL, median, a11y ≥95 + perf mobile ≥85, 7 URL) · security checkpoint (role-check 8 action files, trust boundary, secrets/exec-bit/lockfile, test:rls re-run + gap-closure assert xp/role) · deploy docs + `.env.example` +admin creds · smoke E2E 4 suite trên prod-build + fix testMatch regression · audit reports `docs/superpowers/audits/` · REQUIREMENT-GAP VU-23 + VU-15.
- **Out:** feature mới · fix >10 dòng (→ SF khác) · merge/PR · fabricate prod results.
- **Success criteria (observable):** ACCEPTANCE #1–7 của spec (build+routes 200; median ngưỡng; checkpoint verdict từng mục + test:rls exit 0 (18 tests); smoke 4 suite exit 0 trên prod-build; deploy.md + GAP comment; flow học thật trên prod-build (Rule 0); reports tồn tại).

## 3. Touch map
- **TẠO:** `scripts/lighthouse.mjs` · `scripts/audit-thresholds.mjs` + `.test.ts` · `vitest.audit.config.ts` · `docs/superpowers/audits/lighthouse-2026-09-29.md` · `docs/superpowers/audits/security-checkpoint-2026-09-29.md` · `docs/deploy.md`
- **SỬA NHỎ:** `playwright.config.ts` (testMatch 1 dòng — regex KHÔNG hyphen sau prefix) · `scripts/test-rls.test.ts` (+1 test xp/role-protection) · `.env.example` (+2 dòng ADMIN creds) · `package.json` (+`test:audit`) · fix contrast ngưỡng: `src/app/globals.css` (--primary #c2482e, --secondary #0b756d — light theme) · `src/components/content/level-card.tsx` (band color-mix 60% + badge bg-black/30) · `src/components/layout/footer.tsx` (h4→h3 ×3)
- **ĐỌC-THÔI:** toàn bộ app còn lại. `.env.local` local-only (gitignored).
- **Consumers/regression:** mọi page dùng token primary/secondary (buttons, labels) — fix token đổi màu nhẹ hơn (đậm hơn), scan visual sau fix; level-card band đậm hơn; footer heading level (0 visual đổi).

## 4. Design
- **Approach:** A — npx lighthouse@12 headless (CHROME_PATH=Google Chrome) trên `next start`; `reuseExistingServer` để Playwright dùng prod-server; thresholds pure module lane riêng.
- **Alternatives đã loại:** lhci/lighthouse devDep (nặng); PSI API (cần URL public — bị chặn); sửa webServer config (đụng config chung — không cần).
- **Edge cases:** dev-server fallback khi quên spawn `next start` → guard dev-indicator; run-to-run variance ±3-5 điểm → median của 3; DB rỗng không xảy ra (local ilec seeded); e2e fail trên prod-build → chẩn đoán ISR/hydration/env, fix ≤10 dòng hoặc report.
- **Non-functional:** a11y/perf chính là đối tượng; security checklist §4.3 spec (9 mục); i18n: đo home+lesson cả 2 locale (books chain en — rationale ghi report).

## 5. Implementation outline

- [x] **T1 `prod-build-green` — điều kiện tiên quyết (đã verify trước plan, chốt evidence):**
  - [x] `.env.local` local-only (DATABASE_URL=postgres://hoivu@localhost:5432/ilec + AUTH_SECRET + ADMIN creds) — verify `git check-ignore`
  - [x] `npm run build` exit 0; `next start -p 3110` serve; curl 200 đủ 9 route (home en/vi, books, book, unit, lesson en/vi, sitemap, robots)
  - [x] Commit: không (chỉ infra) — evidence ghi trong T6

- [x] **T2 `thresholds-tdd` — pure module lane riêng:**
  - [x] Step 1 (RED): viết `scripts/audit-thresholds.test.ts` TRƯỚC — case: evalCategory biên (score==min PASS, dưới FAIL, score null FAIL), median chẵn/lẻ, summarize tổng hợp per-URL + exit pass/fail
  - [x] Step 2: `vitest.audit.config.ts` (include `scripts/audit-thresholds.test.ts`) + package.json `"test:audit"`
  - [x] Step 3 (GREEN): `scripts/audit-thresholds.mjs` — `evalCategory`, `median`, `summarize(runs, thresholds)` ESM thuần
  - [x] Step 4: `npm run test:audit` xanh + `npm test` 218 không regression + `typecheck` + `lint` xanh
  - [x] Step 5: commit `feat(audit): thresholds module TDD + test:audit lane (T2)`

- [x] **T3 `lighthouse-audit` — đo + fix ngưỡng:**
  - [x] Step 1: fix testMatch 1 dòng `/(dictation|progress|i18n).*\.spec\.ts/` — verify `npx playwright test --list` đủ 3 file (dictation 6 + progress + i18n), admin không lọt; **commit riêng** `fix(test): restore progress+i18n suites (T3)` (fix thật, không trộn audit-tooling)
  - [x] Step 2: `scripts/lighthouse.mjs` — loop 7 URL × 3 runs, raw JSON lưu `docs/superpowers/evidence/sf-8-production-audit/lighthouse/` với **suffix lượt đo** (`*-pre.json` trước fix / `*-final.json` sau fix — chống ghi đè mất baseline; report md link bộ final), gọi summarize → md table + exit code; eyeball tổng size trước commit
  - [x] Step 3: chạy thật trên prod build (server 3110 đang chạy từ T1) — lượt **pre-fix**
  - [x] Step 4: fix contrast ngưỡng (globals.css 2 token + level-card 2 dòng + footer h4→h3 ×3 — contrast đã verify số học: 4.68 / 5.27 / 5.41-19.3 ≥ 4.5)
  - [x] Step 5: re-build → **kill + re-spawn `next start :3110`** (`next start` load build lúc khởi động — server cũ đo nhầm build cũ, plan-critic P1) → re-chạy 3-run protocol (lượt **final**) → `docs/superpowers/audits/lighthouse-2026-09-29.md` (median từng trang, điều kiện đo, raw JSON paths, rationale locale lệch)
  - [x] Step 6: verify visual sau fix token (screenshot home/lesson — Rule 0 VISUAL)
  - [x] Step 7: commit `fix(a11y): contrast tokens + level-card band + footer heading (T3)` + `audit(sf8): lighthouse runner + report (T3)`

- [x] **T4 `security-checkpoint`:**
  - [x] Step 1 (meta-test RED): test mới `scripts/test-rls.test.ts` — `updateRelaxedMode` với session user → assert chỉ `relaxed_mode` đổi (xp/role/streak nguyên vẹn); mutation tạm: thêm `xp: 999` vào `.set` → test phải ĐỎ → revert
  - [x] Step 2 (GREEN): revert mutation → 18/18 PASS `npm run test:rls`
  - [x] Step 3: `scripts/security-scan.mjs` — secrets (`.env*` không trong git ls-files, grep secret patterns trong src), exec-bit (ngoài node_modules/.git/.next), `.env.example` không giá trị thật, npm audit summary; **script mang allowlist accepted-risk tường minh** (6 vulns postcss-in-next + ID/range + comment lý do — plan-critic P1: nếu không, script không bao giờ tự đạt exit criterion) → exit non-0 CHỈ khi finding NGOÀI allowlist
  - [x] Step 4: role-check code-read 8 Server Action files + trust boundary + admin 2 lớp + SQLi/XSS grep → checklist 9 mục verdict từng dòng
  - [x] Step 5: `docs/superpowers/audits/security-checkpoint-2026-09-29.md` — PASS/FAIL/ACCEPTED từng mục + bằng chứng (lệnh + output)
  - [x] Step 6: commit `feat(audit): security-scan + test:rls xp/role assert + checkpoint report (T4)`

- [x] **T5 `deploy-docs-e2e`:**
  - [x] Step 1: `docs/deploy.md` — pre-req REQUIREMENT-GAP (remote Git/Vercel project, Neon prod branch, AUTH_SECRET, Google OAuth, BLOB token, domain), các bước env/migrate/seed/admin:create (creds KHÔNG vào Vercel env), post-deploy checklist (AC #1-4 + admin tạo+publish lesson), quyết định vercel.json KHÔNG cần + lý do
  - [x] Step 2: `.env.example` +ADMIN_EMAIL/ADMIN_PASSWORD (comment: local dev/e2e only)
  - [x] Step 3: smoke E2E trên prod-build — **kill holder cũ rồi spawn tươi `next start` 3110 + 3000** (chống EADDRINUSE + stale build, plan-critic P1), guard dev-indicator (HTML không chứa `__nextDevIndicator`), chạy `npx playwright test` (dictation+progress+i18n) và `npm run test:e2e` (admin+global-setup) → 4 suite exit 0
  - [x] Step 4: REQUIREMENT-GAP comment VU-23 + VU-15 (liệt kê: remote Git + Vercel project, Neon prod branch DATABASE_URL, AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET, BLOB_READ_WRITE_TOKEN, domain/NEXT_PUBLIC_SITE_URL)
  - [x] Step 5: commit `docs(deploy): deploy guide + env example sync + smoke prod-build evidence (T5)`

- [x] **T6 `evidence-review` — Rule 0 + review độc lập + gate:**
  - [x] Rule 0 3 tầng: DOM (scores JSON), VISUAL (screenshots prod-build home en/vi + lesson — lưu audits/), FLOW (đăng ký → học L3-U1-L1 → thấy XP/streak trên prod-build; admin login + preview)
  - [x] Unit + test:audit + test:rls + 4 e2e suite re-run tổng → evidence `docs/superpowers/evidence/sf-8-production-audit/test-run.txt` (dòng `tdd:` + hash HEAD~1 + output từng lớp)
  - [x] Dispatch code-reviewer ĐỘC LẬP trên diff SF (spec slice + verify criteria + diff) — CHANGES-REQUESTED → fix → re-review; APPROVED + CHECKLIST-4Q comment VU-23
  - [x] Commit evidence + audit log Phase 4/5 + `~/.claude/bin/story-verify sf-8` sạch (B4/B5 PENDING đúng story-hub) — KHÔNG set Done, KHÔNG push/merge

## 6. Risks & unknowns
- **Must verify:** (đã probe) build xanh + routes 200 + test:rls 17/17 + unit 218 + probe Lighthouse perf 88-95/a11y 94 + contrast math. **Còn phải verify khi chạy:** median đủ 7 URL sau fix; guard dev-indicator hoạt động (đối chiếu dev vs prod HTML); e2e trên prod-build lần đầu.
- **Unverified assumptions:** localhost score xấp xỉ tối ưu (throttling mô phỏng vẫn có) — KHÔNG tuyên bố prod-parity; npx lighthouse network lần đầu (fallback devDep ghi report); unit baseline 218 (không phải 179 — meta-tests SF-6 review cộng thêm, đã chạy xanh).
- **Đã biết, chấp nhận (critic-P2):** `NEXT_PUBLIC_SITE_URL=http://localhost:3110` bake vào build → admin suite serve cùng build port 3000 vẫn emit canonical 3110 — e2e dùng baseURL tương đối nên không ảnh hưởng; ghi vào report điều kiện đo.

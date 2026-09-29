# SF-8 Production + audit — Design Spec (VU-23)

Date: 2026-09-29 | Story: VU-15 I Love English Club | Worktree: `sf-8-production-audit` (base `story-vu15-iloveenglishclub`)
Contract: epic spec `2026-09-28-iloveenglishclub-design.md` §9 (ngưỡng binary a11y ≥95, perf mobile ≥85) + §10 M6 + §3 trust boundary · Context pack `docs/superpowers/contexts/sf-8.md`
Pivot epic-level đã chốt: "Supabase production" = **Neon prod branch + Auth.js + Vercel Blob** (chốt SF-1); "RLS re-verify" = script `test:rls` SF-2 (app-level authorization semantics).
Status: Approved (autonomous story-run — epic-level câu hỏi đã chốt, brainstorm self-answer theo Phase 0; DEPLOY BLOCKER đã biết: chưa có remote Git/Vercel project + `BLOB_READ_WRITE_TOKEN` + Google OAuth creds → xử lý trung thực theo run checklist, KHÔNG fabricate).

## 1. Problem

App hoàn chỉnh (SF-1..7 merged: 179 unit tests + 4 e2e specs) nhưng **chưa có bằng chứng chất lượng bằng số** (Lighthouse ngưỡng §9), **chưa có security checkpoint**, **chưa có deploy config/docs**, **chưa có audit reports**. Ngoài ra lần rà hội tụ đầu tiên đã lộ **1 defect thật**: merge SF-6 khôi phục `testMatch: /dictation-*/` của SF-5 trong `playwright.config.ts` → `progress.spec.ts` (SF-6) + `i18n-switch.spec.ts` (SF-7) **không config nào nhặt được** (đã verify bằng `--list`: default config 6 tests dictation duy nhất, admin config 6 tests admin duy nhất) — smoke E2E của SF-8 phải chạy được đủ 4 suite.

Prod URL thật **bị chặn** (thiếu remote Git/Vercel project + tokens — blocker epic-level). SF-8 chạy audit trên **build production serve local** (`next build` + `next start`) + liệt kê REQUIREMENT-GAP trung thực cho phần prod.

## 2. Scope

- **In:** (1) prod build xanh `next build` + `next start` (điều kiện tiên quyết mọi đo); (2) Lighthouse audit ngưỡng binary §9 — a11y ≥95, perf mobile ≥85 từng trang đo, fix findings trong ngưỡng (≤10 dòng); (3) security checkpoint: role-check audit 8 Server Action files + trust boundary §3 + secrets/exec-bit/lockfile scan + `test:rls` re-run; (4) deploy docs `docs/deploy.md` (+ `vercel.json` chỉ khi cần) + đối chiếu `.env.example`; (5) smoke E2E **trên prod-build local** đủ 4 suite (dictation/admin/progress/i18n) + fix testMatch regression; (6) audit reports `docs/superpowers/audits/`; (7) REQUIREMENT-GAP comment VU-23 + VU-15 liệt kê thứ user phải cung cấp.
- **Out:** feature mới (convergence — cấm); fix >10 dòng / thuộc SF khác → report coordinator; merge/PR (human gate — story CLOSE); fabricate kết quả prod.
- **ACCEPTANCE (kiểm từng dòng Phase 5, user-visible):**
  1. `next build` exit 0; `next start` mở được `/en` + `/vi`, browse books → units → lessons
  2. Lighthouse report (JSON + md): a11y ≥95 **và** perf mobile ≥85 trên từng trang đo (home en/vi, books, book, unit, lesson en/vi) — dưới ngưỡng → fix ngưỡng → re-chạy đạt
  3. Security checkpoint report: từng mục checklist có verdict PASS/FAIL/ACCEPTED; `test:rls` exit 0
  4. Smoke E2E trên prod-build local exit 0 — đủ 4 suite (dictation + admin + progress + i18n)
  5. `docs/deploy.md` đủ env vars + migration + seed + admin-create steps; REQUIREMENT-GAP comment lên VU-23 + VU-15
  6. Học 1 bài thật end-to-end trên prod-build local (đăng ký → học → thấy XP/streak) — Rule 0 FLOW tier
  7. Audit reports nằm `docs/superpowers/audits/` — bằng chứng gate

## 3. Touch map

**CHỈ TẠO MỚI (SF-8 sở hữu):**
```
scripts/lighthouse.mjs                       — runner: npx lighthouse (mobile) từng URL trên next start → JSON raw + exit non-0 nếu dưới ngưỡng
scripts/security-scan.mjs                    — secrets/exec-bit/env-example/lockfile checks tự động (exit non-0 khi FAIL)
src/lib/audit/thresholds.ts                  — pure: evalCategory(score,min) + summarize(runs) → pass/fail per category
src/lib/audit/thresholds.test.ts             — TDD RED→GREEN (test DUY NHẤT có logic thật của SF-8)
vitest.audit.config.ts + package.json "test:audit" — pattern config-riêng như test:rls (scripts/** không lọt npm test)
docs/superpowers/audits/lighthouse-2026-09-29.md
docs/superpowers/audits/security-checkpoint-2026-09-29.md
docs/deploy.md
```
**SỬA NHỎ (ngưỡng):** `playwright.config.ts` testMatch 1 dòng → `/(dictation|progress|i18n)-.*\.spec\.ts/` (fix regression merge — smoke phải chạy đủ suite; admin-* vẫn tách config riêng) · fix Lighthouse findings ≤10 dòng nếu lộ (contrast/alt/aria…) · package.json +1 script.
**ĐỌC-THÔI:** toàn bộ app. `.env.local` dựng lại LOCAL-ONLY (gitignored — không commit): `DATABASE_URL=postgres://hoivu@localhost:5432/ilec` (đã verify connect + seed), `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_SITE_URL=http://localhost:3110`, `ADMIN_EMAIL/ADMIN_PASSWORD` (global-setup admin e2e), BLOB/Google để trống (driver local / email-password auth).

## 4. Design

**4.1 Điều kiện đo — trung thực trong report.** Build: `npm run build` (turbopack) với `.env.local` trỏ DB local; serve `next start -p 3110` (và -p 3000 cho admin suite). Lighthouse: `npx lighthouse <url> --only-categories=performance,accessibility --output=json --chrome-flags="--headless=new"` (mobile profile mặc định của CLI — emulated Moto G Power) qua Google Chrome app có sẵn. **Ghi rõ điều kiện: localhost = không network latency, perf local là TRẦN (ceiling) — prod thật có thể thấp hơn; đây là hạn chế trung thực của audit chờ prod URL.** Trang đo: `/en`, `/vi`, `/en/books`, `/en/books/level-3`, `/en/books/level-3/units/1`, lesson listen-and-type (en + vi). Ngưỡng binary áp **từng URL**; score Lighthouse 0–1 → 0.95/0.85.

**4.2 Thresholds module (pure + TDD):** `evalCategory(score, min)` → boolean + `%` display; `summarize(runs: {url, scores}[], thresholds)` → per-URL per-category pass/fail + tổng PASS/FAIL (exit-code logic của script đi qua đây — test được mà không cần chạy Lighthouse). Test viết TRƯỚC module (RED "module chưa tồn tại" → GREEN).

**4.3 Security checkpoint — checklist verdict từng mục (report md):**
1. **Role-check 8 Server Action files** (`actions/auth.ts`, `lib/actions/admin/{lessons,parts,units,users}.ts`, `lib/actions/{my-stats,relaxed-mode,submit-attempt}.ts`): từng action → caller dự kiến, kiểm tra `auth()` + role/ownership ở đâu, verdict PASS/FAIL (code-read, không tin grep một mình — grep chỉ liệt kê)
2. **Trust boundary §3:** submit-attempt chỉ nhận `typed_text` + `client_attempt_id`; KHÔNG nhận accuracy/wpm/xp từ client; server recompute
3. **XP service-role atomic:** submit qua service-role single statement; RLS cấm user tự sửa `profiles.xp` (assert `test:rls`)
4. **test:rls re-run** exit 0 (DB local `ilec` migrated + seeded)
5. **Secrets:** `.env*` gitignored (verify `git check-ignore` + `git ls-files`), 0 secret hardcode trong src (grep pattern), `.env.example` không chứa giá trị thật, exec-bit scan (`find . -perm -111 -type f` ngoài node_modules/.git)
6. **Lockfile deps:** `npm audit` — đã biết 6 vulns (5 moderate + 1 high) toàn **postcss bundle trong next** (build-time tooling, không nhận CSS không tin cậy lúc runtime) → **ACCEPTED** ghi lý do; fix = Next 16 breaking → khuyến nghị SF riêng, không fix trong convergence
7. **Admin gating 2 lớp:** middleware JWT edge + role re-check DB ở admin layout (code-read confirm)
8. **SQLi/XSS:** drizzle parameterized (grep raw template literals), 0 `dangerouslySetInnerHTML` (grep — JSON-LD script của SF-7 dùng jsonldScript escape — đã có test)
9. **Transcript/audio public:** chấp nhận có chủ đích (quyết định epic #11)

**4.4 Deploy docs (`docs/deploy.md`):** pre-req (thứ user phải cung cấp — nhãn REQUIREMENT-GAP): remote Git + Vercel project import; Neon prod branch → `DATABASE_URL`; `AUTH_SECRET` (`openssl rand -base64 32`); Google OAuth creds + redirect URI `{SITE_URL}/api/auth/callback/google`; `BLOB_READ_WRITE_TOKEN` (Vercel Blob store); domain → `NEXT_PUBLIC_SITE_URL`. Bước: set env vars trên Vercel → deploy → `npm run db:migrate` trên prod branch → `db:seed` (7 books) → `admin:create` → post-deploy smoke checklist (các ACCEPTANCE #1-4 chạy lại trên prod URL). **vercel.json: quyết định KHÔNG cần** — Next.js 15 App Router trên Vercel zero-config, không cron/header/region custom; ghi quyết định + vì sao vào deploy.md (touch map nói "nếu cần").

**4.5 Smoke E2E prod-build local:** spawn `next start` TRƯỚC mỗi port (3110 dictation+progress+i18n; 3000 admin+global-setup) → Playwright `reuseExistingServer: !CI` dùng server đang chạy (KHÔNG sửa webServer config — dev command không được gọi). Admin suite cần `ADMIN_EMAIL/ADMIN_PASSWORD` trong `.env.local`. Fix testMatch regression (mục 3) trước. Kết quả là bằng chứng "build production chạy thật" — smoke TRÊN PROD URL vẫn chờ user (REQUIREMENT-GAP).

**4.6 Error handling:** `next start` không lên → script abort với hướng dẫn; Lighthouse run fail/timeout → retry 1 lần rồi exit non-0; e2e fail trên prod-build → chẩn đoán nguyên nhân (dev≠prod: ISR/hydration/env) → fix ngưỡng ≤10 dòng hoặc report SF khác (boundary); scan script exit non-0 khi có FAIL thật (không ăn nhiễu).

## 5. Implementation outline (tasks — DAG deps →)

- **T1 `prod-build-green`**: dựng `.env.local` (local-only) → `npm run build` exit 0 → `next start` serve → curl/curl-check `/en /vi /books /lesson` 200. Exit: build xanh, mọi route public 200.
- **T2 `thresholds-tdd`**: `src/lib/audit/thresholds.ts` + test **viết trước** (RED→GREEN) + `vitest.audit.config.ts` + `npm run test:audit`. Exit: test mới xanh; `npm test` 179 không regression; `npm run typecheck` + `lint` xanh.
- **T3 `lighthouse-audit`**: fix testMatch regression (1 dòng) + `scripts/lighthouse.mjs` + chạy thật trên prod build → JSON raw + `lighthouse-2026-09-29.md`. Dưới ngưỡng → fix ≤10 dòng → re-chạy. Exit: ngưỡng binary đạt từng trang (hoặc finding lớn → report coordinator).
- **T4 `security-checkpoint`**: `scripts/security-scan.mjs` + role-check code-read 8 files + `test:rls` re-run + checklist §4.3 → `security-checkpoint-2026-09-29.md` từng mục có verdict. Exit: `test:rls` exit 0, scan exit 0 (hoặc ACCEPTED có lý do).
- **T5 `deploy-docs-e2e`**: `docs/deploy.md` + quyết định vercel.json + smoke E2E đủ 4 suite trên prod-build + REQUIREMENT-GAP comment VU-23 + VU-15. Exit: e2e exit 0; docs đủ; GAP comment đúng thứ user phải cung cấp.
- **T6 `evidence-review`**: Rule 0 3 tầng (DOM: scores; VISUAL: screenshots prod-build home/lesson; FLOW: đăng ký → học 1 bài → XP/streak trên prod-build) + evidence `docs/superpowers/evidence/sf-8-production-audit/test-run.txt` + code-reviewer độc lập → APPROVED → commit atomic → audit log → story-verify sf-8.

Mỗi task = 1 atomic commit (`audit(sf8): ...` / `chore` / `fix`). KHÔNG `git add -A`. KHÔNG push, KHÔNG merge.

## 6. Risks & unknowns

- (R1 — **phải đo thật**) lesson page client-heavy (player + store) perf mobile có thể <85 → fix ngưỡng hoặc report. (R2) e2e lần đầu chạy trên prod-build (ISR/hydration khác dev) → có thể lộ bug thật; fix ≤10 dòng, lớn hơn → report. (R3) localhost perf = ceiling — ghi điều kiện trong report, không tuyên bố prod-parity. (R4) `npx lighthouse` lần đầu tải package (network) — fallback `npm i -D lighthouse` ghi vào báo cáo. (R5) `test:rls` cần DB state đúng — verify schema hiện diện trước. (R6) ~~i18n/progress testMatch~~ **đÃ VERIFY là defect thật** → fix trong T3 (không còn unknown). (R7) `npm audit` 6 vulns — accepted-risk build-time, khuyến nghị upgrade riêng. (R8) admin e2e global-setup tạo admin user — cần env + DB write access (có).
- **Assumptions ghi rõ:** NEXT_PUBLIC_SITE_URL=localhost khi đo → canonical localhost, không ảnh hưởng perf/a11y score; audio demo chỉ đủ L3-U1-L1 (4 parts) — đủ cho smoke + audit lesson page.

# Plan: SF-4 Admin CMS + storage/upload QA (VU-28)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-09-30 | Linear: VU-28 | Worktree: sf-4-admin-cms-qa | Spec: `docs/superpowers/specs/2026-09-30-sf-4-admin-cms-qa-design.md` (critic PROCEED r2)

## 0. Root cause analysis (WHY — before "what")

### Root cause
Admin surface (VU-15) chỉ được test happy-path — 6 e2e luồng vui. Không có lane nào
probe: chống tamper (forged JWT), validation edge, upload lỗi, revalidate khi sửa unit.
Nguyên nhân sâu: gate VU-15 được viết để CHỨNG MINH flow thiết kế, không phải để TÌM BUG.

### Current state (before feature)
Baseline: `admin-lesson.spec.ts` 6 test + unit 229 + rls 18 + audit 15 — tất cả xanh
(đã verify trên ilec_sf4). Đã biết ở mức code (chưa có RED repro): units create/update
thiếu `revalidateTag` (delete có — `delete-revalidate.test.ts` là precedent); >200 câu
bị truncate ngắm (`dropped` bị hủy); toast upload đếm raw `lines.length`; testMatch
baseline regex không anchor (match theo tên thư mục worktree).

### Expected outcome
Registry QA-300–399 0 OPEN (FIXED có RED→GREEN / BY-DESIGN / DEFERRED có sign-off =
REQUIREMENT-GAP VU-15 sẵn trong code + row + comment VU-28 cuối run); lane e2e admin
mới re-runnable trên DB BẤT KỲ; gating chứng minh 2 lớp thật (kể cả forged JWT);
assertAdmin 17 call site nguyên vẹn; test:rls 18/18 sau mọi fix auth.

### Constraints & hardships
KHÔNG migrate schema (khóa user → DEFERRED) · KHÔNG đổi dep · KHÔNG sửa baseline
configs · KHÔNG đụng SF-2/3/5/6 surface · DB `ilec_sf4` port 3010 · content `[QA-SF4]`
· account `sf4-…@test.ilec` · dev server turbopack có thể treo khi ghi nhiều file →
restart (memory QA) · server action không gọi trực tiếp từ e2e được (RSC protocol) →
logic action test ở unit layer (mock pattern `delete-revalidate.test.ts`).

### High-level strategy
Probe-first theo slice (chạy behavior thật trước khi assert), fix TDD inline tại task
phát hiện, rolling review nhóm 4-5 task, self-clean mỗi spec. KHÔNG exploratory dồn
cuối (FI-190). Sweep lại trên `ilec` là việc SF-6 (specs phải DB-agnostic).

## 1. Problem (intent, NOT solution)

Admin là cổng nhập nội dung duy nhất — gating lỏng = security incident, upload/publish
lỗi = content kẹt. Hiện chưa ai test edge surface này trên code thật.

## 2. Scope

- **In:** 11 slice theo bracket (bootstrap infra, gating 2 lớp + forged JWT, dashboard
  stats, units CRUD edge, lessons CRUD edge, split-sentences UI, upload edge 2 driver,
  publish gate + revalidate thật, audio replace failsoft, users mgmt, triage-fix TDD).
- **Out:** schema migration, auth flow user thường (SF-3), dictation (SF-2), seo
  (SF-5 — finding chéo chỉ ghi), prod (SF-6), dep upgrade, baseline configs,
  `storage.ts` client-safe (trừ bug thật + giữ regression SF-1 GREEN).
- **Success criteria (observable):** registry 0 OPEN; `grep -rn "await assertAdmin()"
  src --include="*.ts" | wc -l` ≥ 17 + list file không mất call site; `npm run
  test:rls` 18/18; unit ≥ 229 + test mới; e2e admin lane xanh trên ilec_sf4; Rule 0
  browser 3 tầng PASS (DOM → screenshot → flow trọn login→…→thấy bài trên public).

## 3. Touch map

- **Create:** `playwright.sf4.config.ts` · `e2e/admin-lib.ts` ·
  `e2e/admin-{gating,dashboard,units,lessons,split-script,upload,publish,audio-replace,users}.spec.ts`
  · unit test cho fix (co-located `*.test.ts`) · `docs/superpowers/evidence/sf-4-admin-cms-qa/test-run.txt`
- **Modify (surgical, chỉ khi bug thật):** `src/lib/actions/admin/{units,lessons,parts,users}.ts`
  · `src/lib/admin/parts-logic.ts` · `src/components/admin/script-splitter.tsx` ·
  `src/app/api/admin/upload/route.ts` · `messages/{vi,en}/admin.json` (sửa CẢ HAI nếu thêm key)
- **Consumers/regression:** `scripts/test-rls.test.ts` (18) · `src/lib/storage.test.ts`
  + import-graph test SF-1 · public dictation pages · `src/messages.test.ts` ·
  baseline `admin-lesson.spec.ts` (phải vẫn pass)
- **Shared:** DB schema READ-ONLY · `BLOB_READ_WRITE_TOKEN` (driver select) · `CONTENT_TAG`

## 4. Design

- **Approach chosen:** A — probe-first per slice + fix TDD inline + rolling review
  nhóm (4-5 task). Lý do: bug phát hiện sớm, fix không đè task khác, review nhỏ.
- **Alternatives dismissed:** exploratory dồn cuối (bug muộn, review khổng lồ —
  FI-190); report-only không fix (trái policy "fix tất cả" epic).
- **Isolation:** DB `ilec_sf4` (template SF-1 — seed core 7 books/14 units/17 lessons/
  38 parts; demo L3-U1-L1 4 parts + 1 attempt) · port 3010 (baseURL + webServer url +
  command) · globalSetup reuse `e2e/global-setup.ts` (env-driven).
- **Re-runnability:** unit 900+`Date.now()%90` (baseline 90–139 không va) · prefix
  `[QA-SF4]`/`sf4-…@test.ilec` · self-clean `afterAll`: DELETE attempts→parts→lessons→units
  (unit ≥900 run này) + unlink `public/audio/**` run tạo + account `sf4-*` xóa
  profiles→users + **role mutation snapshot/restore** (fixture learner
  `e2e-learner@example.com` READ-ONLY — guard đầu spec assert role `user`) · upload
  test dùng buffer, không thả fixture mới.
- **testMatch:** anchored `/admin-[^/]*\.spec\.ts$` — baseline regex không anchor match
  theo đường dẫn tuyệt đối (worktree tên chứa "admin-" → 17 tests thay vì 6 — QA-3xx).
- **Forged-JWT (slice 2):** helper đọc `AUTH_SECRET` + learner id từ DB →
  `encode({token:{sub,role:"admin",...}, secret, salt:"authjs.session-token"})` từ
  `next-auth/jwt` → addCookies → `/admin` phải về `/`. Spike encode/decode ĐÃ PASS;
  e2e end-to-end là bằng chứng chốt.
- **Edge cases chính:** upload 4MB+1 / MIME `text/plain` / `10.mp3` vs `2.mp3` / 7 file
  5 câu / buffer rác (duration null) / 2 file cùng part / replace flow · units number
  0/-1/1.5/dup · delete unit 3 tầng vs có attempt · split 200+1 câu / "?!"/unicode/
  viết tắt (BY-DESIGN) · publish thiếu audio → missing[]; sửa meta bài published →
  public fresh.
- **Non-functional:** security (assertAdmin + rls sau fix auth) · data (chỉ `[QA-SF4]`
  trên ilec_sf4, không NUL byte) · perf (không thêm client JS) · a11y (giữ aria) ·
  i18n (fix key sửa CẢ en+vi).

## 5. Implementation outline

**File structure:** specs ở `e2e/` prefix `admin-*`; helpers chung `e2e/admin-lib.ts`;
unit test co-located; config root `playwright.sf4.config.ts`; npm script mới
`test:e2e:sf4`. Findings ghi `docs/superpowers/evidence/qa-hardening/findings-sf4.md`
row `QA-3xx | sev | surface | repro | root cause | fix commit | regression | status | evidence`.

**Testing strategy:** probe thật (dev 3010 + browser) → spec assert trên behavior
quan sát được → fix RED→GREEN unit (mock `@/auth`+`@/db`+`next/cache` theo
`delete-revalidate.test.ts`) → e2e expansion. Mỗi task 1 atomic commit
`<type>(sf4): …`. Chạy lane: `npx playwright test --config playwright.sf4.config.ts`.

- [ ] **Task 1 — e2e-config-db-bootstrap** (config + env + npm script). Files:
  `playwright.sf4.config.ts` (copy admin config; baseURL/webServer `http://localhost:3010`,
  command `npm run dev -- --port 3010`, testMatch anchored, workers 1, retries 0,
  timeout 90s, expect 15s, locale vi-VN, globalSetup `./e2e/global-setup.ts`,
  reuseExistingServer `!process.env.CI`), `package.json` script
  `test:e2e:sf4`. `.env.local` đã bootstrap (DATABASE_URL → ilec_sf4, ADMIN_EMAIL/
  ADMIN_PASSWORD generate, AUTH_SECRET có). Verify: `lsof -i :3010` trống →
  `npm run test:e2e:sf4` chạy `admin-lesson.spec.ts` 6/6 PASS trên ilec_sf4 →
  `npx playwright test --config playwright.sf4.config.ts --list` = đúng N tests
  admin family. Commit `test(sf4): sf4 e2e config port 3010 + ilec_sf4`.
- [ ] **Task 2 — gating-probe + admin-lib** (helpers dùng chung). Files:
  `e2e/admin-lib.ts` (`loginAsAdmin`, `createQaUnit`/`createQaLesson` — unique-per-run,
  `cleanupQaUnit(unitNumber)` FK-order, `cleanupQaAccounts(prefix)`,
  `seedQaUser` bcrypt insert pattern `seed-attempts.ts`, `forgeAdminJwt(userId)`),
  `e2e/admin-gating.spec.ts`: guest UI `/admin` → redirect login; guest POST upload
  → 401; learner UI đăng nhập → `/admin` → redirect `/` (layer 2); learner POST → 403;
  forged JWT (sub=learner id, role claim admin) → `/admin` → redirect `/`; learner
  fixture guard (role vẫn `user` đầu spec). Baseline assertAdmin trước/sau
  (`grep -c`). Commit `test(sf4): gating 2 lớp + forged-JWT + admin-lib`.
- [ ] **Task 3 — dashboard-stats.** `e2e/admin-dashboard.spec.ts`: login → số liệu UI
  đối chiếu SQL trực tiếp (helper read-only `adminStats()` mới trong `e2e/db.ts` —
  lessons/published/parts/missing/users) — assert từng stat khớp; perBook row book
  level-3 khớp count DB. Commit `test(sf4): dashboard stats khớp DB`.
- [ ] **Task 4 — units-crud-edge.** `e2e/admin-units.spec.ts`: number 0/-1/1.5 →
  invalidNumber; trùng số → duplicateNumber; title rỗng → titleRequired; delete unit
  có lessons (cascade OK, public unit list mất); delete unit có attempt part →
  hasAttempts toast; **probe bug #1a** (update title unit CÓ bài published → public
  TOC fresh?) + **probe #1b** (create unit rỗng → public book thấy?) — RED repro nếu
  stale → finding QA-3xx + fix `revalidateTag(CONTENT_TAG)` unconditional (precedent
  delete) + unit test mock pattern `delete-revalidate.test.ts` RED→GREEN.
  Commit `fix(sf4): units revalidate + CRUD edge specs` (hoặc test-only nếu BY-DESIGN).
- [ ] **Task 5 — lessons-crud-edge.** `e2e/admin-lessons.spec.ts`: tạo auto-number
  max+1; sửa meta (title/vocab) draft + published (public fresh — revalidate đã có);
  delete lesson rỗng OK; điều hướng editor breadcrumb; vocab bắt buộc (disabled
  submit). Commit `test(sf4): lessons CRUD edge`.
- [ ] **Task 6 — split-sentences-ui.** `e2e/admin-split-script.spec.ts`: paste 5 câu →
  preview 5; unicode/emoji nguyên vẹn; viết tắt "Mr. Smith…" tách sai + limitation
  note hiển thị + merge tay sửa lại (BY-DESIGN — assert behavior, không fix);
  manual split/merge/add/remove từng dòng; **probe bug #2**: 205 dòng → hiện tại chèn
  200 im lặng (RED) → fix bỏ slicing `sanitizeSentences` (guard `tooManySentences`
  ăn, error key sẵn) + rewrite `parts-logic.test.ts` contract tests (TDD RED→GREEN) +
  toast đếm non-empty (`script-splitter.tsx` save()). Commit
  `fix(sf4): split >200 chặn rõ + toast count đúng`.
- [ ] **Task 7 — upload-edge-two-drivers.** `e2e/admin-upload.spec.ts`: >4MB client
  pre-check error + server 413 (buffer 4MB+1); MIME `text/plain` → 415
  unsupportedFormat; numeric sort: files `10.mp3`,`2.mp3`,`01.mp3` → map 2→câu2,
  10→câu10 (10 part lesson) hoặc 2 trước 10 trong list; 7 file / 5 câu → 2 unmapped
  warning; 2 file cùng số → duplicate warning; buffer rác → duration null không
  crash (failsoft); per-file status + retry riêng (route block 1 file — pattern
  baseline); driver local THẬT (file xuất hiện `public/audio/...`, self-clean);
  blob: probe `BLOB_READ_WRITE_TOKEN` — không có → ghi nhận evidence (không fail).
  Commit `test(sf4): upload edge local driver + failsoft`.
- [ ] **Task 8 — publish-gate-revalidate.** `e2e/admin-publish.spec.ts`: thiếu audio →
  chặn + missing[] đúng số; đủ → publish → **navigation MỚI** URL public ngay sau
  publish = 200 + thấy nội dung (retry budget 0 — revalidate thật); unpublish → 404;
  sửa title bài published → public fresh (revalidate đã có — verify); upload audio
  cho bài published → public thấy audio mới (revalidate trong upload route đã có —
  verify). Commit `test(sf4): publish gate + revalidate thật`.
- [ ] **Task 9 — audio-replace-failsoft.** `e2e/admin-audio-replace.spec.ts`: replace
  flow UI (select part + pick file) → part path giữ convention `{NN}.{ext}`, toast
  replaced; replace file MIME khác ext (mp3→wav) → path đổi ext đúng; replace với
  buffer rác → duration null, part vẫn cập nhật audioPath (failsoft, không crash);
  durationMs invalid form value → null. Commit `test(sf4): audio replace failsoft`.
- [ ] **Task 10 — users-mgmt.** `e2e/admin-users.spec.ts`: seed `sf4-user@test.ilec`
  (admin-lib `seedQaUser`) → search thấy → đổi role user→admin (DB verify) → đổi
  lại → self-row select disabled + badge "(bạn)"; unit `users.test.ts` (mock auth/db):
  `invalidRole` (runtime enum), `cannotChangeSelf`, ok path. Gap khóa user → row
  DEFERRED (REQUIREMENT-GAP VU-15 trong `users.ts:11` là sign-off có sẵn). Self-clean
  xóa account. Commit `test(sf4): users mgmt role + DEFERRED khóa user`.
- [ ] **Task 11 — triage-fix-e2e-expansion.** Sweep registry: mọi row OPEN → FIXED
  (RED→GREEN) hoặc BY-DESIGN/DEFERRED có rationale; re-run toàn lane: unit (≥229 + mới)
  · rls 18/18 · audit 15/15 · e2e sf4 lane full; assertAdmin ≥17 + list call site;
  Rule 0 browser 3 tầng (DOM ✓ → VISUAL screenshot tự Read → FLOW trọn login→unit→
  lesson→script→upload→publish→thấy trên public); viết
  `docs/superpowers/evidence/sf-4-admin-cms-qa/test-run.txt` (dòng đầu `^tdd:` + hash
  code commit cuối); post verdict review Linear. Commit
  `docs(sf4): findings registry 0 OPEN + evidence test-run`.

## 6. Risks & unknowns

- **Must verify (probe trước khi kết luận):** bug #1 tách 2 probe (update-title vs
  create-empty — kết quả khác nhau có thể BY-DESIGN); revalidate thật = navigation
  mới 200, không poll; blob token probe.
- **Unverified assumptions:** forged-JWT e2e end-to-end (spike đã PASS mức lib);
  ilec_sf4 state drift (đã verify seed core + baseline 17/17 GREEN); server action
  không test được trực tiếp từ e2e (unit layer thay thế).
- **Mitigation có sẵn:** turbopack treo → restart dev; kill server stale trước lane;
  `workers:1` chống giành DB; cap 3 attempt/task rồi escalate.

# Spec — SF-4 Admin CMS + storage/upload QA (VU-28 · story VU-24 QA hardening)

Date: 2026-09-30 · Status: Approved (autonomous — spec-critic round 2: PROCEED, 0 P0/P1; round 1 FIX-P0-FIRST đã sửa: account lifecycle, AUTH_SECRET, DEFERRED sign-off, tách probe bug #1) · Design: none (QA slice, epic spec §3 SF-4)
Context pack: `docs/superpowers/contexts/qa-hardening/sf-4.md` · Impact: epic `2026-09-29-qa-hardening-impact.md` §2a + SF-4 run (comment VU-28)

## 0. Root cause analysis

Admin là cổng nhập nội dung — baseline (VU-15) chỉ có happy-path: `e2e/admin-lesson.spec.ts`
6 test luồng vui. Edge chưa từng test: gating chống forged-JWT (chỉ có probe 401/403 đơn),
validation CRUD, upload lỗi (size/MIME/sort/mismatch), revalidate khi sửa meta unit, users
mgmt runtime validation. Rủi ro thực: gating lỏng = security incident; upload/publish lỗi =
content kẹt (không nhập được bài mới).

Chiến lược (đã chốt epic): exploratory **probe-first theo slice** — chạy behavior thật trước,
viết spec assert trên behavior quan sát được, fix TDD finding tại chỗ (không dồn cuối).
Lý do: bug tìm muộn = fix chạm code đã "xong" + review khổng lồ (FI-190).

## 1. Problem

Nền tảng ship với gate xanh nhưng admin surface chỉ phủ happy path. Cần: (a) probe edge
có hệ thống 11 slice admin, (b) triage bug-thật vs BY-DESIGN vs enhancement, (c) fix TDD
mọi bug-thật (policy "fix tất cả", DEFERRED chỉ khi out-of-scope có sign-off), (d) e2e
expansion re-runnable giữ lại làm regression vĩnh viễn.

Ai/cuối nào: admin content team + platform security — trước prod QA (SF-6).

## 2. Scope

**In (11 slice theo bracket):**
1. Bootstrap e2e infra: `.env.local` worktree (**copy từ worktree primary rồi override**:
   `DATABASE_URL` → `ilec_sf4` + `ADMIN_EMAIL/ADMIN_PASSWORD` generate + **bắt buộc có
   `AUTH_SECRET`** — Auth.js v5 dev server không start khi thiếu, forged-JWT helper đọc nó)
   + `playwright.sf4.config.ts` port 3010 + globalSetup (reuse `e2e/global-setup.ts`
   env-driven — tạo admin trên ilec_sf4).
2. Gating 2 lớp: guest → login redirect; user thường → layout redirect `/`; **forged-JWT**
   (token hợp lệ chữ ký, role claim admin, sub = learner) → middleware cho qua, layout
   re-check DB chặn. assertAdmin **17** call site giữ nguyên (context pack ghi 16 — stale).
3. Dashboard stats khớp DB thật (đối chiếu SQL trực tiếp).
4. Units CRUD edge: number invalid/duplicate (23505), title rỗng, delete cascade lesson,
   delete có attempts (23503 → hasAttempts), revalidate unit title (nghi bug #1).
5. Lessons CRUD edge: auto-number, sửa meta (revalidate khi published), delete RESTRICT,
   điều hướng editor, race duplicate (logic 23505).
6. Split-sentences UI: split đúng N câu, unicode/emoji, viết tắt Mr./e.g. = BY-DESIGN
   (limitation note hiển thị + manual merge fix được), **nghi bug #2: >200 câu bị truncate
   ngậm** (sanitize bỏ `dropped` — server chèn 200, toast nói 300).
7. Upload edge: >4MB (client pre-check + server 413), MIME sai (415), per-file status,
   retry riêng file fail, **numeric sort** (2.mp3 trước 10.mp3), mismatch (file ≠ câu),
   duration failsoft (buffer giả → duration null không crash). Driver local THẬT; blob
   không token → ghi nhận evidence (context pack mục 7, không fail mơ hồ).
8. Publish gate: thiếu audio chặn + missing[] đúng; publish → public thấy NGAY
   (revalidateTag thật, không xu); unpublish → 404; sửa meta bài published → public cập
   nhật. Chạy trên lesson [QA-SF4] riêng (không đụng demo).
9. Audio replace: replace flow giữ path convention; duration failsoft khi không đọc được.
10. Users mgmt: đổi role **trên account chuyên dụng `sf4-user@test.ilec`** (tạo bởi spec,
    user⇄admin, verify DB) — KHÔNG đụng role fixture learner `e2e-learner@example.com`
    (gating slice dùng learner này READ-ONLY); chặn tự-đổi (UI disabled + action
    cannotChangeSelf — unit test), runtime enum validate (unit test invalidRole); gap
    "khóa user" (thiếu `profiles.banned`) → **DEFERRED** (schema out-of-scope).
11. Triage-fix: fix TDD mọi finding QA-300–399 + e2e expansion `admin-*.spec.ts`
    re-runnable DB BẤT KỲ (sweep cuối SF-6 chạy lại trên `ilec`).

**Out:** schema migration (khóa user), auth flow user thường (SF-3), dictation (SF-2),
seo/sitemap content mới (SF-5 — finding chéo chỉ ghi), prod (SF-6), dep upgrade, baseline
configs (`playwright.admin.config.ts`, `playwright.config.ts`), `src/lib/storage.ts`
client-safe trừ bug thật (giữ tách client/server `3617eed` + regression SF-1 GREEN).

**Success criteria:** registry `docs/superpowers/evidence/qa-hardening/findings-sf4.md`
0 OPEN (FIXED có RED→GREEN / BY-DESIGN / DEFERRED). **Cơ chế DEFERRED sign-off cho run
autonomous:** sign-off = REQUIREMENT-GAP VU-15 đã ghi sẵn trong code (`users.ts` — gap
khóa user) + row registry QA-3xx với rationale + comment tổng kết trên VU-28 cuối run;
KHÔNG cần approval user giữa chừng. `test:rls` 18/18 sau mọi fix chạm auth; assertAdmin
giữ nguyên: verify = `grep -rn "await assertAdmin()" src --include="*.ts" | wc -l` ≥ 17
và list file không mất call site nào so với baseline; Rule 0 browser 3 tầng PASS;
baseline `admin-lesson.spec.ts` vẫn pass trên cả ilec_sf4 (re-runnability probe).

## 3. Touch map

```
MỚI:      playwright.sf4.config.ts · e2e/admin-{gating,dashboard,units,lessons,
          split-script,upload,publish,audio-replace,users}.spec.ts · e2e/admin-lib.ts
          (helper: login/unit-fixture/self-clean/forged-jwt) · vitest test cho fix
SỬA surgical: src/lib/actions/admin/{units,lessons,parts,users}.ts ·
          src/app/api/admin/upload/route.ts · src/components/admin/** ·
          src/lib/admin/** · src/lib/storage-server.ts · messages/{vi,en}/admin.json
          (chỉ khi fix thêm key — sửa CẢ HAI)
DOCS:     docs/superpowers/evidence/qa-hardening/findings-sf4.md (registry commit sẵn —
          cùng đường dẫn SF-1 setup) · evidence/sf-4-admin-cms-qa/test-run.txt
KHÔNG đụng: baseline configs · storage.ts (client-safe) · SF-2/3/5 surface · schema
```

Regression candidates: `scripts/test-rls.test.ts` (18) · `src/lib/storage.test.ts` +
import-graph test SF-1 · public dictation pages (tiêu thụ lessonParts) ·
`src/messages.test.ts` parity.

Shared: DB schema (READ-ONLY), `BLOB_READ_WRITE_TOKEN` (chọn driver), `CONTENT_TAG`.

## 4. Design

### Isolation (bắt buộc dispatch)
- DB `ilec_sf4` (template SF-1 — đã verify: seed core 7 books/14 units/17 lessons/38
  parts, demo L3-U1-L1 4 parts + 1 attempt, 0 rác QA). Không đụng Neon/`ilec`.
- Port **3010** 3 chỗ (baseURL, webServer url, command `npm run dev -- --port 3010`).
- Config copy `playwright.admin.config.ts`: testMatch **anchor `/admin-[^/]*\.spec\.ts$`**
  (⚠ probe thật: baseline regex không anchor match theo đường dẫn TUYỆT ĐỐI — ở worktree
  tên `sf-4-admin-cms-qa` chữ "admin-" trong tên dir khớp MỌI spec, `--list` = 17 tests/4
  files; ở `sf-1-qa-baseline` chỉ 6 — match set phụ thuộc tên thư mục checkout = finding
  registry, config baseline KHÔNG sửa theo boundary), workers:1, retries:0, timeout 90s,
  expect 15s, `locale: "vi-VN"`, globalSetup reuse `e2e/global-setup.ts` (env-driven →
  admin tạo trên ilec_sf4), `reuseExistingServer: !process.env.CI` (port 3010 riêng tránh
  bẫy chéo worktree QA-2; server sf4 stale từ run cũ vẫn bị phát hiện bằng lsof trước
  khi chạy — restart khi nghi env cũ, turbopack treo khi ghi nhiều file thì restart).
- **Environment verified (probe thật):** baseline e2e 17/17 GREEN trên ilec_sf4 (6 admin +
  6 dictation + 2 i18n + 3 progress — gồm cả suite bị contaminate vào lane) — globalSetup
  tạo admin trên ilec_sf4 OK, seed-attempts fixture OK, fixtures 01–05.mp3 đủ.
  Baseline lanes: unit 229/229 · rls 18/18 (trực tiếp trên ilec_sf4) · audit 15/15.

### Re-runnability (P1-4 — chạy lại được trên DB BẤT KỲ)
- Unit number `900 + Date.now() % 90` (900–989; baseline dùng 90–139 — không va).
- Lesson/account/title prefix `[QA-SF4]` / `sf4-…@test.ilec`.
- **Self-clean cuối mỗi spec** (`afterAll`): DELETE theo FK-order
  attempts→parts→lessons→units (unit number ≥900 của run) + unlink `public/audio/**`
  file run tạo (theo path convention) + **vòng đời tài khoản**: account `sf4-*@test.ilec`
  spec tạo → xóa profiles rồi users trong self-clean; **mọi mutation role snapshot trước
  + khôi phục sau** (users spec chỉ mutate account chuyên dụng của mình — fixture learner
  `e2e-learner@example.com` của globalSetup là READ-ONLY, đầu spec assert role vẫn `user`
  làm guard chống contamination chéo run). Upload test dùng **buffer** (`setInputFiles`
  {name,mimeType,buffer}) — không thả fixture mới vào repo.
- Không assert "DB có đúng N row" — anchor theo giá trị unique-per-run.
- Registry note: baseline `admin-lesson.spec.ts` KHÔNG self-clean (để lại unit 90–139
  trên DB) — out-of-scope sửa baseline; sweep sau không nhầm với rác `[QA-SF4]`.

### Gating probe (slice 2) — forged-JWT
Helper `e2e/admin-lib.ts`: đọc `AUTH_SECRET` + learner id từ DB → `encode()` từ
`next-auth/jwt` (salt = tên cookie session) → gắn cookie → `/admin` phải redirect `/`.
Verify round-trip thật trước khi spec hóa (spike trong task 2); nếu encode không tái được
cookie hợp lệ → REQUIREMENT-GAP lên VU-24 với log probe (không giả lập).

### Approaches đã cân nhắc
- **A (chọn):** per-task probe-first + fix TDD inline + rolling review nhóm 4-5. Bug phát
  hiện sớm, fix không đè lên task khác, review nhỏ.
- B (reject): exploratory dồn cuối + fix loạt — muộn, review khổng lồ.
- C (reject): report-only không fix — trái policy "fix tất cả" của epic.

### Edge cases chính (probe từng slice — spec assert trên behavior thật)
- Upload: file 4MB+1 byte; MIME `text/plain`; `10.mp3` vs `2.mp3`; 7 file / 5 câu;
  buffer rác (duration null); upload 2 file cùng part (last-wins + duplicate warning);
  replace từ UI (select part + pick file).
- Units: number 0/-1/1.5; trùng số book; delete unit 3 tầng (lessons+parts); delete unit
  có attempt part (RESTRICT).
- Split: 200+1 câu (nghi bug #2); câu chỉ dấu câu "?!"; unicode "Tiếng Việt ế…"; viết tắt
  "Mr. Smith went in. e.g. this." (BY-DESIGN tách sai — limitation note + merge tay).
- Gating: learner đăng nhập → `/admin` (middleware cho, layout redirect `/`); forged
  token role=admin; guest API upload 401; learner API 403; action direct không qua UI
  (unit test mock auth).

### Non-functional
- Security: mọi fix giữ assertAdmin; test:rls 18/18 sau fix auth; upload route không nới
  size/MIME; forged-JWT là test chủ đích.
- Data: chỉ `[QA-SF4]` trên ilec_sf4; self-clean; không NUL byte vào file/output
  (attempt-key lesson VU-15).
- Perf: không thêm client JS; không đụng lighthouse baseline.
- a11y: fix UI giữ aria (uploader đã có aria-live, select có label).
- i18n: admin vi cố định; fix thêm key → sửa CẢ `messages/vi/admin.json` +
  `messages/en/admin.json` (messages.test parity).

## 5. Implementation outline

Test strategy 3 lớp:
1. **Probe thật** (dev server 3010 + browser/Playwright chạy ad-hoc) trước khi viết
   assert — spec trên behavior quan sát được.
2. **Fix TDD:** unit RED→GREEN trong lane đúng (`vitest.config.ts` src/**; action test
   mock `@/auth` + `@/db` theo pattern `delete-revalidate.test.ts`); e2e RED→GREEN khi
   fix đổi behavior UI.
3. **E2E expansion** `admin-*.spec.ts` — mỗi slice 1 file, self-clean, unique-per-run.

File placement theo convention sẵn có: e2e ở `e2e/`, unit test co-located `*.test.ts`,
helpers dùng chung `e2e/admin-lib.ts` (import extensionless như global-setup).

Commit: mỗi task 1 atomic commit `<type>(sf4): …` (test/fix/docs), không `git add -A`.

## 6. Acceptance (user-visible)

1. Admin đăng nhập được, dashboard đúng số liệu đối chiếu DB; guest/user thường/forged
   JWT không vào được `/admin` (2 lớp thật).
2. Nhập được unit → lesson → script → tách câu (sửa tay được, unicode ổn) → upload audio
   (per-file status, retry riêng, numeric sort đúng 2<10) → publish → bài hiện trên site
   NGAY (revalidate thật — assertion: navigation MỚI tới URL public ngay sau publish phải
   200 + thấy nội dung, retry budget 0 — không poll chờ cache).
3. Upload lỗi (hỏng/quá lớn/sai MIME) xử lý êm — per-file error rõ, retry được từng file,
   không treo cả lô.
4. Users mgmt đổi role chạy đúng, không tự-đổi được mình; enum lạ từ chối êm.
5. Mọi bug surface: FIXED có regression (RED→GREEN) hoặc DEFERRED có rationale +
   sign-off (khóa user).
6. Test:rls 18/18 + assertAdmin 17 call site nguyên vẹn sau mọi fix auth.
7. Rule 0: browser 3 tầng — DOM ✓, VISUAL screenshot ✓ (tự Read ảnh), FLOW trọn
   login→unit→lesson→script→upload→publish→thấy trên public ✓.

## 7. Risks & unverified assumptions

1. **Forged-JWT encode round-trip** — ✅ ĐÃ SPIKE PASS (`next-auth/jwt` encode → JWE `dir`
   → decode giữ sub + role claim; cùng thư viện middleware dùng). Còn verify end-to-end
   trong e2e (middleware chấp nhận, layout chặn).
1b. **testMatch baseline không anchor** — ✅ ĐÃ PROBE (`--list` 17 tests ở worktree tên
   chứa "admin-", 6 ở worktree thường) — finding registry; config sf4 dùng anchored regex.
2. **Nghi bug #1 tách 2 probe riêng** (cùng root-missing-revalidateTag nhưng hệ quả khác):
   (i) `updateUnitAction` đổi title unit CÓ bài published → public TOC có fresh không
   (expect stale — rõ là bug); (ii) `createUnitAction` unit rỗng → public book page có
   hiển thị unitCount/unit mới không (nếu TOC ẩn unit rỗng thì create stale là BY-DESIGN).
   Hai kết quả → hai row registry độc lập. Fix (nếu bug): `revalidateTag(CONTENT_TAG)`
   unconditional sau mutation thành công — cùng precedent `deleteUnitAction`; đúng
   revalidate matrix VU-15 §5.
3. **Nghi bug #2** truncate >200 câu ngắm — đã xác minh code: `addPartsFromScriptAction`
   hủy cấu trúc `dropped` (chèn 200 im lặng) + toast đếm `lines.length` THÔ (gồm dòng
   rỗng). Fix hướng sạch (spec-critic P2): bỏ slicing trong `sanitizeSentences` (trả hết
   cleaned) → guard `tooManySentences` sẵn có của action ăn (error key đã có trong
   admin.json, không thêm i18n) + toast đếm dòng non-empty client-side. TDD RED trên
   behavior hiện tại; `tooManySentences` hiện là dead-branch (sanitize cắt trước khi
   check) — test mới đánh thức nó.
4. ilec_sf4 có thể drift nếu SF khác cùng template đụng — verify lại data trước bootstrap.
5. Turbopack dev treo khi ghi nhiều file → restart (memory QA); kill server stale trước
   e2e (port 3010 riêng nhưng kiểm tra lsof).
6. Blob driver không token local — code-path local thật; blob chỉ ghi nhận, KHÔNG fail.
7. assertAdmin 17 (không phải 16) — baseline lại trước exit check.
8. Server action gọi trực tiếp từ e2e khó (RSC protocol) — logic action test ở unit layer,
   e2e chỉ phủ UI path.

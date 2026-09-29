# Plan: SF-5 Admin CMS (VU-20)
Date: 2026-09-29 | Linear: VU-20 | Worktree: sf-5-admin-cms
Spec: docs/superpowers/specs/2026-09-29-sf5-admin-cms-design.md (rev 2 — sau spec-critic cycle 1)

## 0. Root cause analysis (WHY)

### Root cause
Platform chỉ có nội dung qua seed script — không có giao diện nhập liệu, teacher (non-technical) không thể tự vận hành. Nguyên nhân sâu: SF-2 dựng content model (schema/queries/cache) nhưng deliberately bỏ qua write-side.

### Current state (before feature)
- `/admin` chỉ có placeholder dashboard (SF-1) — role-gate 2 lớp hoạt động, không có CRUD.
- Thêm 1 lesson = sửa `scripts/seed.ts` + re-run seed (cần `lame`, cần biết code).
- 0 users trong DB local — chưa có tài khoản admin để login.

### Expected outcome
Teacher tự nhập end-to-end trên `/admin`: unit → lesson → dán script → split câu → upload audio hàng loạt (map số tự động, nghe thử per-part) → publish → học viên thấy ngay trên trang public (revalidateTag).

### Constraints & hardships
- KHÔNG đổi schema (boundary — thiếu cột "khóa" user → REQUIREMENT-GAP VU-15); unique(lessonId,sortOrder) NOT deferrable → shift qua bump-offset trong transaction.
- Upload KHÔNG qua Server Action (body limit ~1MB) → Route Handler; cap 4MB (Vercel serverless ~4.5MB).
- DB local `ilec`; storage driver local `public/uploads` (blob branch có sẵn trong lib/storage.ts — SF-8 chỉ thêm token).
- Playwright chưa có trong repo — cài devDep; SF-4 song song → merge regen lockfile (quy ước sẵn).
- Single executor trong 1 worktree — task tuần tự, KHÔNG Orca DAG (file đan xen chặt; DAG chỉ có giá trị với multi-worker).

### High-level strategy
Nhập liệu tối ưu tốc độ (spec §6): mirror route public; server-render + server-action-per-op; 3 client component (script-splitter / parts-editor / audio-uploader) quanh lesson editor; tái dùng 100% lib có sẵn.

## 1. Problem (intent, NOT solution)
Teacher cần nhập và xuất bản bài dictation (script + audio) độc lập không cần dev — ảnh hưởng mọi lesson mới hàng tuần.

## 2. Scope
- **In:** dashboard; units CRUD; lessons CRUD; lesson editor (paste→split→manual fix; bulk upload per-file status/retry; numeric-sort mapping; mismatch; preview player per-part); publish gate; published-edit + unpublish + revalidate matrix; RESTRICT-protect part delete; users search + đổi role; E2E Playwright.
- **Out:** books CRUD; "khóa" user (gap); dictation UI SF-4; SEO SF-7; attempts/XP SF-6; Blob cloud SF-8; schema migration; cleanup orphan audio (defer SF-8).
- **Deviations ghi nhận (spec §1):** select-mapping thay drag-reorder; ↑↓ move; Testing Library defer (pure-fn tests + E2E route-interception phủ).
- **Success criteria:** 5 ACCEPTANCE context pack sf-5.md (chi tiết map ở spec §6).

## 3. Touch map
- **Modify:** `admin/layout.tsx` (nav + NextIntlClientProvider locale="vi" messages JSON + Toaster), `admin/page.tsx` (dashboard thật), `messages/{en,vi}/admin.json`, `.gitignore` (+`public/uploads`).
- **Create:** `src/lib/admin/queries.ts`; `src/lib/actions/admin/{units,lessons,parts,users}.ts` (+ test pure fns); `src/app/api/admin/upload/route.ts`; `src/components/admin/{script-splitter,parts-editor,audio-uploader}.tsx`; pages `admin/books/page.tsx`, `admin/books/[book]/units/page.tsx`, `admin/books/[book]/units/[unit]/lessons/page.tsx`, `admin/books/[book]/units/[unit]/lessons/[lesson]/page.tsx`, `admin/users/page.tsx`; `scripts/create-admin.ts`; `playwright.config.ts`; `e2e/admin-lesson.spec.ts` + `e2e/fixtures/01..05.mp3`.
- **Read-only (regression):** `content/{queries,guards,split-sentences}.ts`, `lib/storage.ts`, `lib/revalidate.ts`, `db/schema.ts`, middleware, public pages SF-2 (tag `content`), `components/ui/*`.
- **Shared surfaces:** DB units/lessons/lesson_parts/profiles (write-side mới); storage path `audio/{slug}/unit-{n}/lesson-{n}/{NN}.{ext}` (khớp seed); package.json (devDep @playwright/test).

## 4. Design
- **Approach:** Route Handler upload (A) — Phase 0; alternative client-direct Blob loại (local driver không token).
- ** sortOrder primitive (P0):** invariant 1..N liên tục; shift = transaction [bump +1000] → [áp delta] → [hạ −1000]; deletePart=del+shift(−1); insertEmpty=shift(+1)+ins; movePart=swap qua vùng cao; splitPart=shift(+(k−1))+update row+ins k−1; mergePartDown=join+del+shift(−1).
- **Revalidate matrix (chốt):** mutation thành công trên published lesson → `revalidateContent()`; draft → không (client router.refresh). Mọi action + upload route áp dụng đồng nhất.
- **Edge cases:** 23505 units+lessons (race); 23503 RESTRICT (cascade verified schema:133/167/193/226); upload replace = overwrite cùng path; file trùng số = stable sort + warning; file không số = "chưa map" + select tay; durationMs fail-soft null; publish gate missing[] list; admin tự đổi role mình → chặn; NN pad-2 (>99 giữ "100"); slug sai → notFound.
- **Non-functional:** Security — assertAdmin mọi action + upload route; mime `audio/*` + cap 4MB. Perf — admin reads không cache; upload tuần tự. i18n — vi-cố định (getTranslations explicit locale — VERIFIED từ source next-intl) + en mirror. A11y — buttons thật, label, aria trạng thái upload, focus-visible tokens.

## 5. Implementation outline

### Tasks (ordered, mỗi task = 1 atomic commit; exit criteria MỖI task: `npm run lint && npm run typecheck && npm test` green (+ build khi đụng pages) — không green không commit)
1. **T1 foundation + dashboard** — `lib/admin/queries.ts` (getAdminBooks/Units/Unit/Lessons/Lesson/Dashboard, searchUsers — search ilike display_name HOẶC email) + `admin/page.tsx` dashboard thật + layout (nav, provider locale="vi" messages JSON import, Toaster) + messages keys skeleton.
2. **T2 units + lessons CRUD + users** — actions `units.ts`, `lessons.ts` (create/update/delete — CHƯA publish), `users.ts` (changeRole chặn self); pages books → units → lessons (list + form) + `admin/users/page.tsx` (search + role select).
3. **T3 publish gate + revalidate** (plan-critic: lên trước editor UI — publish không bao giờ tồn tại chưa-gate trong history) — `validatePublish(parts)` pure fn + `publishLesson/unpublishLesson` + revalidateContent() matrix wiring cho actions hiện có. Vitest: validatePublish (pass/missing text/missing audio/empty).
4. **T4 parts actions + editor UI** — `parts.ts` (addPartsFromScript(lessonId, sentences[]) + primitive shift + split/merge/insert/move/delete/updateText; mọi mutation published → revalidate) + `script-splitter.tsx` (kèm note known-limitation Mr./e.g./3.5/ellipsis — epic §6.3) + `parts-editor.tsx` (inline edit, preview player, RESTRICT disable + tooltip) + editor page (meta form + publish/unpublish + gate display) + messages đầy đủ. Vitest: pure fns (validate sentences, trim/empty). Fallback nếu verify-loop: tách server/UI thành 2 commit.
5. **T5 upload route + uploader UI** — `api/admin/upload/route.ts` (assertAdmin → mime/size 4MB → resolve join → buildAudioPath ext map → putAudio → update part → revalidate theo matrix) + `audio-uploader.tsx` (parse/sort/map/replace/retry per-file + warnings + durationMs) + `.gitignore`. Vitest: `parseFileNameIndex`, `numericFileSort`, `mimeToAudioExt` — 100% nhánh.
6. **T6 infra: create-admin + Playwright + attempts seed** — `scripts/create-admin.ts` (env upsert, không đụng seed.ts), devDep `@playwright/test@^1.63` + `npx playwright install chromium` (P1: không cài browsers T7 chết run đầu), `playwright.config.ts` (webServer dev :3000; login qua UI trong test helper — 1 spec file, không cần storageState), fixtures 5 mp3 (lame, commit), **seed attempts ACCEPTANCE #5** (script tạo 1 non-admin user + 1 attempt trên 1 part của lesson demo — để case RESTRICT-disable có data thật).
7. **T7 E2E** — `e2e/admin-lesson.spec.ts` (prereq: local Postgres `ilec` running + migrated + seeded + ADMIN_EMAIL/ADMIN_PASSWORD env): flow chính (login→dashboard→unit→lesson→paste 5 câu→split→upload 5→publish→public placeholder thấy bài+audio fresh); case thiếu audio chặn publish; case 1 file abort → per-file error → retry → done; case non-admin upload API 403; **case ACCEPTANCE #5 (P0 fix): part có attempts → nút xóa disabled + tooltip RESTRICT hiện; unpublish thành công**. ACCEPTANCE #1 action-level: upload route 403 (E2E) + assertAdmin đã contract-test trong `scripts/test-rls.test.ts` (deny non-admin/anon — có sẵn SF-2) — server action không gọi trực tiếp được từ ngoài (action ID encrypted), coverage qua 2 lớp này là đủ + trung thực. Script `test:e2e`.
8. **T8 verify + evidence** — lint/typecheck/test/build green; browser 3 tầng Rule 0; evidence `docs/superpowers/evidence/sf-5-admin-cms/test-run.txt` (HEAD + tdd note — convention như sf-2/sf-3).

## 6. Risks & unknowns
- **Must verify:** dev serve `public/uploads` mới ghi (Rule 0; fallback route stream); 23503 qua DrizzleQueryError.cause (E2E xác nhận); VI messages ngoài [locale] (VERIFIED source + Rule 0 nhìn UI).
- **Assumptions:** Playwright + turbopack dev đủ nhanh webServer (không → build+start); revalidateTag fresh request kế (E2E assert).

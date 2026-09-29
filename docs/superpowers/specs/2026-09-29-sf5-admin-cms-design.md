# SF-5 Admin CMS — Design Spec (VU-20)

> Story VU-15 · epic spec `2026-09-28-iloveenglishclub-design.md` §6 (contract), §3 (trust boundary), §4 (DELETE RESTRICT).
> Design tokens: `docs/superpowers/designs/vu15-dictation-direction.md` — B "Classroom Warm" (đã map đủ trong `src/app/globals.css` từ SF-1/2 — admin DÙNG LẠI tokens, không thêm token mới).
> Context pack: `docs/superpowers/contexts/sf-5.md`.
> Rev 2 (2026-09-29) — sau spec-critic cycle 1: pin sortOrder shift-semantics (P0), chốt upload/revalidate/preview, ghi nhận deviations.

## 0. Root cause & strategy

Teacher không tự nhập nội dung được — mọi lesson phải seed tay → platform không vận hành được. Chiến lược: CMS nhập liệu tối ưu tốc độ (spec §6), tái dùng 100% content model SF-2 (schema/queries/revalidate/assertAdmin), split-sentences SF-3, storage abstraction SF-1 (`lib/storage.ts` ĐÃ implement đầy đủ local + Blob branch — Blob cloud thật chỉ cần token ở SF-8, không viết thêm). KHÔNG đổi schema, KHÔNG đụng dictation UI (SF-4 song song).

## 1. Scope

**In:**
- Dashboard: lessons/parts theo book, drafts, users mới, attempts gần đây
- Units CRUD (chọn book; number + title EN/VI + desc optional)
- Lessons CRUD (chọn unit; title EN/VI + vocab_level enum + draft/published)
- Lesson editor: paste script → split (SF-3) → manual fix (gộp/tách/thêm/xóa/di chuyển từng dòng) → bulk upload audio (per-file status + retry riêng, numeric sort mapping, mismatch UI) → nghe thử per-part (preview player) → publish gate
- Published lesson: sửa text / thay audio OK (+revalidate — matrix §5); xóa part chỉ chặn khi có attempts; unpublish
- Users: search, đổi role
- E2E Playwright: admin tạo lesson end-to-end + case thiếu audio chặn publish + case per-file fail/retry

**Out (boundary):** books CRUD (7 dòng cố định), attempts/XP/leaderboard (SF-6), SEO metadata (SF-7), schema change, dictation UI (SF-4), Blob cloud thật (SF-8 — abstraction sẵn sàng, chỉ cần env), "khóa" user (schema thiếu cột — REQUIREMENT-GAP đã ghi VU-15), cleanup file audio mồ côi khi delete (defer — v1 chấp nhận orphan trong storage, DB không giữ path chết vì delete part đã bị RESTRICT khi có attempts; trường hợp không attempts orphan nhỏ, dọn SF-8).

**Deviation decisions (ghi nhận tường minh so với pack/epic):**
- Mapping file↔part: auto-map theo số + **select tay** cho file chưa-map — KHÔNG drag-reorder (pack nói "drag đổi vị trí"; ACCEPTANCE chỉ yêu cầu dropzone + auto-map đúng số; select đơn giản + accessible hơn; drag = future)
- Move part = nút ↑↓ (pack liệt kê gộp/tách/thêm/xóa; move là bổ sung hợp lý cho manual fix + mapping select)
- Component test Testing Library (epic §9 "admin editor mapping"): **defer** — repo chưa có infra Testing Library; mapping logic được tách pure fn + unit test nhánh 100%; behavior retry-fail phủ bằng E2E route-interception

## 2. Routes & IA

```
/admin                        Dashboard (thay placeholder SF-1)
/admin/books                  Danh sách 7 books → chọn để vào units
/admin/books/[book]/units     Units list + tạo/sửa/xóa unit (slug sai → notFound)
/admin/books/[book]/units/[unit]/lessons          Lessons list + tạo lesson
/admin/books/[book]/units/[unit]/lessons/[lesson] Lesson editor
/admin/users                  Users table + search + role
POST /api/admin/upload        Route Handler upload audio (multipart)
```

- Layout `/admin` giữ role-gate 2 lớp hiện có (middleware JWT + layout DB re-check) — bổ sung nav (Dashboard/Sách/Users) + `NextIntlClientProvider locale="vi"` + Toaster (sonner).
- UI tiếng Việt cố định (spec §3). Server components: `getTranslations({locale:"vi", namespace:"admin"})` — VERIFIED từ source next-intl 4.14: `getConfig(localeOverride)` set `requestLocale = Promise.resolve(override)` → `request.ts` load đúng catalog vi. Client components: `useTranslations` qua provider nhận messages truyền thẳng từ layout (import JSON — không phụ thuộc request context).
- `messages/en/admin.json` mirror tiếng Anh (touch map yêu cầu 2 file).
- Book param = slug (`level-1`…`level-7`); unit/lesson param = number; path convention NN pad-2 (`padStart(2,"0")` — số >99 giữ nguyên "100", không cắt).

## 3. Data flow & components

**Admin queries** (`src/lib/admin/queries.ts` — MỚI): đọc trực tiếp db, KHÔNG `unstable_cache` (admin luôn fresh; public cache chỉ stale qua `revalidateContent()`). Hàm: `getAdminBooks` (books + counts lessons/parts), `getAdminUnits(bookId)`, `getAdminUnit`, `getAdminLessons(unitId)` (kèm published + partsCount + missing-audio count), `getAdminLesson(lessonId)` (lesson + unit + book + parts kèm attemptsCount từng part), `getAdminDashboard`, `searchUsers(q)`.

**Server actions** (`src/lib/actions/admin/{units,lessons,parts,users}.ts` — MỚI): MỌI action mở đầu `await assertAdmin()` (tái dùng `lib/content/guards` — spec §3: không tin middleware). Pattern trả về như auth actions: `{ ok: true } | { error: string; missing?: number[] }` (error key → message qua admin.json). DB errors bắt qua `DrizzleQueryError` `.code ?? .cause?.code` (pattern `registerAction`): 23505 (trùng number) → "trùng số" (CẢ units VÀ lessons — lessons create auto max+1 vẫn catch cho race 2 admin), 23503 (RESTRICT attempts) → "đã có attempts — unpublish thay vì xóa" (xác nhận cascade từ schema: units→lessons cascade, lessons→parts cascade, attempts→parts RESTRICT — delete unit/lesson có attempts nổ 23503 tại bảng attempts).

**Primitive sortOrder (P0 fix — pin CHÍNH XÁC):**
Invariant: `sortOrder` của parts trong 1 lesson LUÔN liên tục 1..N (không lỗ). Mọi mutation giữ invariant qua bump-offset trick trong 1 transaction (constraint unique NOT deferrable — không đụng schema):
```
shiftParts(tx, lessonId, where: {from?: n, after?: n}, delta): 
  1. UPDATE lesson_parts SET sort_order = sort_order + 1000 WHERE lesson_id AND <điều kiện>   -- nhặt khỏi vùng thấp
  2. UPDATE ... SET sort_order = sort_order + 1000 + delta WHERE sort_order > 1000 AND lesson_id  -- áp delta trong vùng cao
  3. UPDATE ... SET sort_order = sort_order - 1000 WHERE sort_order > 1000 AND lesson_id        -- hạ về vùng thấp, unique thoả từng statement
```
Ứng dụng: **deletePart(n)** = delete row n + shift (from n+1, delta −1). **insertEmptyPart(after)** = shift (after+1, +1) + insert rỗng. **movePart(n, dir)** = swap n↔n±1 (2 rows qua vùng cao +1000, hạ ngược đổi chỗ). **splitPart(n)** = pieces = splitSentences(text); nếu <2 pieces → no-op error; shift (n+1, +(k−1)); update row n text=piece[0]; insert k−1 rows pieces[1..] tại n+1..n+k−1. **mergePartDown(n)** = cần row n+1 tồn tại; update row n text = `n + " " + (n+1)`; delete row n+1; shift (n+2, −1). Mọi op bọc `db.transaction`.

**Parts actions** (`parts.ts`): `addPartsFromScript(lessonId, sentences: string[])` — CHỐT signature: client gửi mảng câu CUỐI (đã split + manual fix client-side bằng chính module `splitSentences` — pure, client-safe); server validate từng câu non-empty sau trim (bỏ câu rỗng), cap 200 câu/lần, append sortOrder từ max+1, transaction; client disable nút khi in-flight (double-submit guard). `updatePartText(partId, text)` (non-empty). `splitPart/mergePartDown/insertEmptyPart/movePart/deletePart` như primitive trên.

**Lessons actions** (`lessons.ts`): create (number AUTO = max(number)+1 trong unit; sortOrder=number — seed convention; catch 23505), `updateLessonMeta` (titleEn/titleVi/vocabLevel), `publishLesson` (GATE §4), `unpublishLesson`, delete (catch 23503).

**Units actions** (`units.ts`): create (number nhập tay, unique(bookId,number) → catch 23505), update, delete (catch 23503).

**Users actions** (`users.ts`): `changeUserRole(userId, role)` — assertAdmin + CHẶN đổi role của chính mình (tránh tự khóa mình khỏi /admin).

**Upload Route Handler** (`src/app/api/admin/upload/route.ts` — MỚI, runtime nodejs) — single write path cho audio (KHÔNG có action setPartAudio riêng):
- `POST` multipart FormData: `file`, `lessonId`, `partIndex` (sortOrder), `durationMs` (optional string)
- `assertAdmin()` → 401/403 JSON nếu fail
- Validate: mime `audio/*` (mimetype từ Content-Type của part trong FormData; sai → per-file error), size ≤ **4MB** (Vercel serverless Route Handler body limit ~4.5MB — cap an toàn cả local lẫn prod; mp3 1 câu ~3.5s ≈ 60KB, dư địa lớn; file lớn hơn → SF-8 chuyển client-direct transport)
- Resolve context từ lessonId: join lessons→units→books lấy (books.slug, units.number, lessons.number) → path = `buildAudioPath({book: slug, unit: 'unit-'+n, lesson: 'lesson-'+n, index: partIndex})` — ĐÚNG convention seed; extension theo mime (mpeg/mp3→`.mp3` mặc định, wav→`.wav`, mp4→`.m4a`, aac→`.aac`, ogg→`.ogg`, webm→`.webm`)
- Part phải tồn tại `(lessonId, sortOrder=partIndex)` → không → 404
- `putAudio(path, buffer, mime)` — driver hiện hành (local ghi `public/uploads/`; blob branch có sẵn). **Upload trùng part = replace** (overwrite cùng path, `addRandomSuffix: false`)
- Update DB: `lessonParts.audioPath + durationMs` (durationMs parse fail → null — fail-soft)
- **Revalidate theo matrix §5** (published lesson → `revalidateContent()`)
- Trả JSON `{ok:true, path}` | `{error, status}` — client hiện per-file status

Lý do Route Handler thay vì Server Action: body limit ~1MB của Server Action chết với audio (spec §6). Vercel Blob client-direct (alternative) bị loại: cần BLOB_READ_WRITE_TOKEN — local driver không có (Blob thật là SF-8).

**Client components** (`src/components/admin/`):
- `script-splitter.tsx`: textarea dán script → nút Split → preview danh sách câu (client `splitSentences`) + manual fix (merge-down/split/thêm/xóa/↑↓) → Save (gửi mảng câu; disable khi in-flight). Note known-limitation hiển thị (Mr./e.g., 3.5, ellipsis — theo JSDoc SF-3).
- `parts-editor.tsx`: danh sách part (số thứ tự, text inline-edit blur→`updatePartText`, audio status: path hoặc badge "chưa ghép", **preview player** `<audio controls preload="none" src={resolveAudioUrl(audioPath)}>` khi có audio — teacher nghe thử trước publish, attemptsCount>0 → nút xóa disabled + tooltip "đã có học viên làm bài (RESTRICT)", split/merge/insert/↑↓/delete). Mọi op trên published lesson → server tự revalidate (matrix §5) + client `router.refresh()`.
- `audio-uploader.tsx`: dropzone nhiều file → parse số đầu tên (`/^(\d+)/`) → **sort NUMERIC** (không lexicographic: `10.mp3` < `2.mp3`; stable sort — file trùng số giữ thứ tự input, UI warning "file sau sẽ thay file trước" khi trùng) → auto-map file#N → part#N; file không có số đầu → badge "chưa map" + select tay gán vào part; file#N > tổng part → warning liệt kê; part chưa có audio → "chưa ghép"; thay file 1 part = select lại file vào row (auto-map đã chiếm thì row đó hiển thị file mới). Upload tuần tự từng file (đơn giản, tránh flood server): per-file status uploading/done/error + **nút Retry riêng file fail**. durationMs đọc client qua `Audio` metadata (objectURL + `loadedmetadata`; fail → không gửi → null).

**Editor page** = lesson meta form (title EN/VI, vocabLevel select, publish/unpublish + gate message liệt kê part thiếu, delete lesson) + `ScriptSplitter` (thêm câu) + `PartsEditor` + `AudioUploader` (map audio) + link xem trang public.

## 4. Publish gate (validation bắt buộc — spec §6)

`publishLesson(lessonId)`: assertAdmin → load parts → điều kiện ALL:
1. ≥1 part
2. Mọi part: `text` non-empty sau trim
3. Mọi part: `audioPath` non-null

Vi phạm → `{error:"publishBlocked", missing:[số part thiếu]}` — KHÔNG publish (chặn broken lesson). Đạt → `published=true` + `revalidateContent()`. Unpublish luôn cho phép + `revalidateContent()`. title_en bắt buộc ở level create (NOT NULL schema) — publish re-assert không rỗng.

## 5. Revalidate matrix (chốt — không "hoặc")

**Rule:** mọi mutation THÀNH CÔNG trên lesson có `published=true` → `revalidateContent()`; trên draft → KHÔNG (chỉ `router.refresh()` client). Áp dụng đồng nhất: updatePartText, split/merge/insert/move/deletePart, upload route (replace audio), updateLessonMeta, publish/unpublish. Draft ops không stale public cache (draft vốn không hiện). → public page sau publish/sửa/thay-audio luôn fresh ở request kế (unstable_cache tag `content` — wire sẵn SF-2).

## 6. ACCEPTANCE → verify map (user-visible, từ context pack)

1. Login admin → `/admin` dashboard số liệu; non-admin bị chặn (UI redirect + gọi thẳng action → ForbiddenError)
2. Tạo unit → lesson → paste → split → đúng N dòng, sửa tay được
3. Kéo 5 file `01.mp3`…`05.mp3` → map đúng thứ tự số; file 3 fail → retry riêng file 3 (E2E: Playwright `page.route` abort đúng 1 file → thấy error → unroute → retry → done)
4. Thiếu audio 1 part → Publish chặn kèm thông báo rõ; đủ → Publish → placeholder lesson page public thấy bài + audio phát (gate đo placeholder SF-2 + revalidateTag — KHÔNG đòi SF-4)
5. Published lesson: xóa part có attempts disable + giải thích RESTRICT; unpublish được

## 7. Testing strategy

- **Unit (Vitest, trong `npm test`)**: pure fns 100% nhánh — `parseFileNameIndex` (số đầu tên: `01.mp3`, `1.mp3`, `1 - abc.mp3`, không có số, số 0 dẫn), `numericFileSort` (stable, trùng số), `mimeToAudioExt` (map + fallback), `validatePublish(parts)` (pass / missing text / missing audio / empty lesson). Đặt cạnh module (`src/lib/admin/*.test.ts`, `src/lib/actions/admin/*.test.ts` theo convention `src/**`).
- **E2E (Playwright — `e2e/admin-lesson.spec.ts`)**: devDep `@playwright/test@^1.63` + `npx playwright install chromium` + config (webServer `npm run dev` port 3000, timeout lớn; login qua UI trong test helper). Prereq: local Postgres `ilec` migrated+seeded + script seed attempts (1 non-admin user + 1 attempt trên part demo — cho case RESTRICT). Flow chính: login → dashboard → tạo unit → tạo lesson → paste 5 câu → split → lưu → upload 5 fixtures → publish → mở `/en/books/.../listen-and-type` thấy bài + `<audio>` + revalidate fresh. Case phụ: thiếu audio → publish chặn; 1 file bị abort (route interception) → per-file error → retry OK; **ACCEPTANCE #5: part có attempts → xóa disabled + tooltip RESTRICT; unpublish OK**; non-admin gọi upload API → 403 (action-level phủ bởi contract test `scripts/test-rls.test.ts` assertAdmin deny + E2E redirect UI — server action không gọi trực tiếp được từ ngoài). KHÔNG chạy trong CI `npm test` (vitest include `src/**` only) — script `test:e2e`.
- **`scripts/create-admin.ts` (MỚI)**: upsert user+profiles role=admin từ env `ADMIN_EMAIL`/`ADMIN_PASSWORD` (bcrypt) — KHÔNG đụng `seed.ts` (SF-2). Dùng cho dev browser + E2E globalSetup.
- **Fixtures**: 5 mp3 tone nhỏ (lame sinh 1 lần, commit `e2e/fixtures/`) — repo đã commit mp3 (public/audio).
- **Browser 3 tầng (Rule 0)**: DOM eval + screenshot so tokens (B Classroom Warm) + flow trọn login→…→public page (Orca browser; fallback headless Chrome cho VISUAL tier theo kit).

## 8. Risks & mitigations

| Rủi ro | Mitigation |
|---|---|
| FK 23503 catch qua DrizzleQueryError `.cause` | pattern đã có ở registerAction (`.code ?? .cause?.code`) — E2E delete-part-có-attempts xác nhận |
| Next dev serve file mới ghi `public/uploads` | dev serve public/ dynamic — Rule 0 browser xác nhận; nếu không → thêm route stream file local |
| SF-4 song song cài Playwright trùng | boundary quy ước regen lockfile lúc merge; spec file khác nhau |
| `getTranslations({locale:"vi"})` ngoài [locale] | VERIFIED từ source next-intl (getConfig localeOverride → requestLocale) + Rule 0 nhìn UI tiếng Việt |
| Serverless 4.5MB body limit prod | cap upload 4MB — client validate + server reject |
| Orphan audio files khi delete (không attempts) | DEFER tường minh — dọn ở SF-8; DB không còn path (part đã xóa), orphan chỉ tốn storage |
| unstable_cache không stale sau publish | `revalidateContent()` trong mọi published mutation (matrix §5) — E2E assert public fresh |

# Plan — SF-2 Content model + public pages (VU-17) — I Love English Club

**Spec slice:** `docs/superpowers/contexts/sf-2.md` · **Spec gốc:** `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` (§2 + §4 + §8 = contract)
**Worktree:** `sf-2-content-public` (branch fork từ `story-vu15-iloveenglishclub`, base = merge SF-1)
**Pivot mapping:** xem REQUIREMENT-GAP comment trên VU-15 (2026-09-29) — Supabase → Neon/Drizzle/Auth.js/lib-storage (chốt SF-1); DB local-first `ilec` (postgresql@16) vì worktree không còn Neon credentials.
**Plan-critic:** FIX-P0-FIRST (2026-09-29) — đã áp: P0 trigger-deviation (hướng b), 4 P1, 8 P2 (chi tiết audit log VU-17).

## 0. Root cause analysis

- **Root cause:** SF-1 dựng foundation (auth + i18n + design system) nhưng chưa có schema content nào — học viên chưa thể thấy sách/unit/lesson. Spec §4 viết theo Supabase; data layer thực tế là Drizzle + Neon.
- **Current state:** Home placeholder, `/books` không tồn tại, DB chỉ có users/accounts/sessions/verification_tokens/profiles (tối thiểu).
- **Expected outcome:** browse Home → Books (7 sách) → Book (units) → Unit (lessons) → placeholder lesson (title + số câu + demo audio phát được) — success criterion epic "chọn sách → thấy units → thấy lessons".
- **Constraints:** KHÔNG đổi kiến trúc data layer SF-1; build xanh không cần DATABASE_URL (CI giữ AUTH_SECRET placeholder); KHÔNG thêm dependency (merge song song SF-3, regen lockfile); audio demo tự sinh không bản quyền.
- **High-level strategy:** migration ADD-only đầy đủ §4 (không cắt cho milestone sau) + content queries bọc `unstable_cache(tags:['content'])` (revalidateTag có răng từ đầu) + SSG/ISR đúng §3 + seed idempotent 1 script.

## 1. Problem

Học viên (anon + user) chưa duyệt được cấu trúc 7 sách Cambridge Prepare — dữ liệu demo + trang browse là nền cho SF-4 (học bài) và SF-5 (admin nhập nội dung).

## 2. Scope

- **In scope:** migration schema đầy đủ §4 + leaderboard view; authorization app-level + test script per-role; seed 7 books + demo units/lessons/parts (≥1 lesson published + audio PHÁT ĐƯỢC); content-queries-lib fallback `vi→en→raw`; Home thật (7 level cards + 4-step method); /books; /books/[book]; /books/[book]/units/[unit]; placeholder lesson `listen-and-type`; wire `revalidateTag('content')`; nav Levels + footer links (stub handoff SF-1).
- **Out of scope (boundary context pack):** player/dictation UI (SF-4 — chỉ placeholder tĩnh); admin UI + Server Action CRUD (SF-5); ghi attempts/XP/progress (SF-6 — chỉ tạo bảng + invariant); SEO metadata/sitemap (SF-7); deploy.
- **Deviation notes (đối chiếu context pack — đã ghi REQUIREMENT-GAP VU-15):**
  - *RLS → app-level authz:* pivot chốt SF-1. ACCEPTANCE "non-admin không ghi được content" assert qua contract `assertAdmin()` (mock session deny/allow) + không tồn tại write surface public — KHÔNG qua DB policy.
  - *TRIGGER `on_auth_user_created` → profiles:* **KHÔNG tạo DB trigger** — sẽ double-insert vỡ `registerAction` (SF-1 `src/app/actions/auth.ts` đã insert profiles trong transaction; 23505 bị catch thành `emailTaken` sai ngữ nghĩa). Thay thế đã có từ SF-1: `events.createUser` (auth.ts, cover OAuth) + register transaction (cover email). SF-2 giữ nguyên cả 2 path, T4 assert **invariant "mọi users row có profiles row"**.
- **Success criteria (ACCEPTANCE — kiểm từng dòng ở Phase 5):**
  1. `/books` thấy đúng 7 sách (CEFR + kỳ thi mục tiêu); vào sách thấy units theo số; vào unit thấy lessons; lesson placeholder thấy title + số câu.
  2. Home: 7 level cards + khối 4-step method.
  3. Lesson demo audio phát được (bấm play ra tiếng), published=true.
  4. Bài thiếu `title_vi` → hiện fallback tiếng Anh, không rỗng.
  5. `npm run test:rls` exit 0: anon đọc published-only; user A không lộ data user B (surface chưa có path đọc hộ — deviation note ở trên); non-admin không ghi được content (assertAdmin deny); admin guard cho phép admin.
  6. Build xanh với env ĐẦY ĐỦ TRỪ DATABASE_URL/BLOB_READ_WRITE_TOKEN/GOOGLE_* (giữ AUTH_SECRET placeholder đúng như CI SF-1) + `npm run lint/typecheck/test` xanh.

## 3. Touch map

- **Tạo:** `drizzle/0001_*.sql` (generate + view) · `scripts/seed.ts` · `scripts/test-rls.test.ts` + `vitest.rls.config.ts` · `src/lib/content/localize.ts` (pure) · `src/lib/content/queries.ts` · `src/lib/content/guards.ts` · `src/lib/revalidate.ts` (+ test) · `src/components/content/{level-card,book-cover,unit-row,lesson-row,method-grid,localized-text}.tsx` · `src/app/(public)/[locale]/books/page.tsx` · `.../books/[book]/page.tsx` · `.../books/[book]/units/[unit]/page.tsx` · `.../lessons/[lesson]/listen-and-type/page.tsx` · `messages/{en,vi}/books.json` · `public/audio/level-3/unit-1/lesson-1/{01..04}.mp3` (commit chủ đích — 4 file tone tự sinh, sạch bản quyền, vài chục KB; deterministic generator nên seed chạy lại ra bytes giống → worktree SF-4/SF-5 sau merge phát được audio không cần re-generate).
- **Sửa:** `src/db/schema.ts` (mở rộng ADD-only) · `messages/{en,vi}/home.json` (mở rộng) + `lesson.json` (fill placeholder) + `common.json` (+1 key `nav.levels`) · `src/messages.test.ts` (bỏ assert lesson.json `=== {}`) · `src/components/layout/header.tsx` + `footer.tsx` (stub comment SF-1 chỉ định SF-2 nối link) · `package.json` (scripts `db:migrate`/`db:seed`/`test:rls` — **0 dependency mới**) · `src/app/(public)/[locale]/page.tsx` (Home thật thay placeholder — SF-2 sở hữu). **KHÔNG sửa** `src/app/actions/auth.ts` (SF-1-owned — deviation trigger ở trên).
- **Consumers/regression:** layout `generateStaticParams` (giữ nguyên), middleware (không đổi), SF-1 tests (phải vẫn xanh).
- **Shared surfaces:** DB schema (ADD-only) · route contract lesson (cố định spec §3 — SF-4 thay vào) · tag cache `content` (SF-5 gọi `revalidateContent()`).

## 4. Design

- **Approach: Direction A (pivot-mapped).** Schema §4 đầy đủ qua Drizzle; leaderboard = `pgView` (probe ĐÃ PASS — drizzle-kit emit CREATE VIEW + track snapshot); authorization app-level (pivot chốt SF-1) + `assertAdmin()` guard dùng chung cho SF-5; content reads bọc `unstable_cache(..., { tags: ["content"], revalidate: 300 })` bên ngoài try/catch fallback (lỗi DB lúc build → trả rỗng, KHÔNG cache lỗi); pages SSG/ISR: books/units `generateStaticParams` từ DB (`catch→[]` + `dynamicParams=true`), lesson ISR on-demand (`dynamicParams=true`, generateStaticParams `[]`); mọi page mới gọi `setRequestLocale(locale)` (nếu không next-intl đẩy route sang dynamic — SSG vỡ câm); localize pure helper (`localize(locale, {en, vi}, fallbackRaw?)` — vi: `vi→en→raw`, en: `en→vi→raw`).
- **Alternatives dismissed:** (B) RLS thật DB roles + session-var — vi phạm pivot/directive; (C) cắt bảng user-data — cấm bởi context pack; (D) seed SQL thuần — không sinh/upload được audio; (E) DB trigger profiles — vỡ registerAction SF-1 (P0 critic).
- **Edge cases:** build thiếu DATABASE_URL (fallback rỗng + ISR heal khi chạy thật); unit/lesson param không tồn tại hoặc unpublished → `notFound()`; seed chạy lại (ON CONFLICT DO NOTHING/upsert); audio phát được ở cả 2 locale route (path driver-relative).
- **Non-functional:** perf (indexes FK columns; count gộp 1 query/call); security (server-only data layer, không secrets, guard admin); a11y (focus-visible 3px, aria-label nav); i18n (mọi copy qua messages EN⇄VI parity; số dùng tabular-nums).

## 5. Implementation outline

Tasks (thứ tự thực thi, mỗi task ≥1 atomic commit):

- [ ] T1. Schema + migration (exit criterion: diff schema vs §4 **từng dòng, 0 thiếu**): mở rộng `src/db/schema.ts` —
  - `books`: id (1–7, int PK), slug (unique), title_en, title_vi, cefr_label, exam_target, desc_en, desc_vi, color, sort_order
  - `units`: id (identity PK), book_id FK, number, title_en, title_vi, desc_en, desc_vi (optional), sort_order, created_at, UNIQUE(book_id, number)
  - `lessons`: id, unit_id FK, number, title_en, title_vi, kind ('dictation' text default), vocab_level pgEnum('Pre-A1','A1','A2','A2+','B1','B1+','B2','B2+'), sort_order, published (bool default false), created_at, UNIQUE(unit_id, number)
  - `lesson_parts`: id, lesson_id FK, sort_order, text (notNull), audio_path (nullable), duration_ms (nullable int), UNIQUE(lesson_id, sort_order); DELETE RESTRICT đạt qua FK `attempts.part_id ON DELETE RESTRICT`
  - `attempts`: id, user_id FK→profiles, part_id FK (RESTRICT), typed_text, accuracy real, wpm real, **xp real**, **client_attempt_id uuid**, created_at, UNIQUE(user_id, part_id, client_attempt_id)
  - `user_lesson_progress`: user_id, lesson_id, done_parts int, best_accuracy real, updated_at, UNIQUE/PK(user_id, lesson_id)
  - `daily_activity`: user_id, date, parts_done int, UNIQUE(user_id, date)
  - `profiles` +: xp int default 0, streak_count int default 0, last_active_date (date nullable)
  - `leaderboard` pgView: scope ('weekly'|'all_time'), display_name, avatar_url, xp — weekly = SUM(attempts.xp) ISO Mon–Sun TZ Asia/Ho_Chi_Minh; all-time = profiles.xp; KHÔNG expose id/email
  - indexes FK columns (units.book_id, lessons.unit_id, lesson_parts.lesson_id, attempts.user_id, attempts.part_id)
  - FRESH DB trước migrate đầu (dropdb/createdb ilec) → `drizzle-kit generate` (0001) → `npm run db:migrate` → smoke query view.
- [ ] T2. Content lib: `localize.ts` (pure + unit test trong `npm test`) · `queries.ts` (getBooks/getBook/getUnits/getUnit/getLessons/getLesson — unstable_cache tag content + published-only + counts, try/catch fallback build-safe) · `guards.ts` (`assertAdmin()`) · `revalidate.ts` (`revalidateContent()` + **unit test vi.mock next/cache assert revalidateTag("content")**).
- [ ] T3. Seed: `scripts/seed.ts` idempotent (node type-strip, relative imports): 7 books đúng bảng §2 (màu theo design hand-off `docs/superpowers/designs/vu15-dictation-direction.md` §1.7) + demo units/lessons/parts; lesson demo L3-U1-L1 (4 parts, tone WAV→lame mp3 3–4s/part qua `putAudio`, duration_ms set, published=true, **audio commit vào git**); L3-U1-L2 published với **title_vi NULL** (fallback case, trong cây browse để FLOW chạm được); các unit khác 1–2 lesson published (text đủ, audio null); npm scripts; audio path theo layout §3 `audio/{book}/{unit}/{lesson}/{NN}.mp3`.
- [ ] T4. `scripts/test-rls.test.ts` + `vitest.rls.config.ts` (config tự định nghĩa include scripts/** + alias `@/` + nạp dotenv/config; KHÔNG lọt `npm test`) + `npm run test:rls`: fixtures tự tạo/tự dọn; assert **anon** published-only (draft ẩn, getLesson(draft)=null); **user non-admin** bị chặn ghi (assertAdmin deny với session mock) + không tồn tại path đọc hộ data user khác; **admin** guard allow; UNIQUE/RESTRICT contracts (double-submit, part-with-attempts không xóa được, daily_activity unique); view columns đúng bộ cho phép + xp weekly/all-time đúng; invariant users↔profiles (deviation trigger — xem §2); exit 0.
- [ ] T5. Messages: `books.json` (EN+VI) · `home.json` mở rộng (method/levels/CTA/trust) · `lesson.json` fill placeholder · `common.json` +`nav.levels` · update `messages.test.ts` (lesson không còn `=== {}`).
- [ ] T6. Pages browse: `/books` + `/books/[book]` (§2.4 aside cover + MetaList + UnitList) + `/books/[book]/units/[unit]` (§2.5 LessonList) + components content — đúng tokens/hand-off, progress cá nhân ẩn (anon SSG, không fake data), mọi page gọi `setRequestLocale`.
- [ ] T7. Home thật: hero split + LevelPath 7 cards (band màu level, CEFR pill, exam, lessons count) + MethodGrid 2×2 (§2.3).
- [ ] T8. Placeholder lesson `listen-and-type`: breadcrumb + title + số câu + CTA link mù (disabled + note SF-4) + `<audio controls>` demo khi có audio_path.
- [ ] T9. Header nav "Levels" → `/books` + footer 7 level links (slug `level-1..7` — contract seed; label EN hardcode giữ từ SF-1, SF sau localize bằng title_vi nếu cần).
- [ ] T10. [GATE] Browser verify 3 tầng (DOM eval → VISUAL screenshot so b.html/hand-off → FLOW browse Home→Book→Unit→placeholder + switch EN/VI + play audio) + build probe env-đầy-đủ-trừ-DB (AUTH_SECRET placeholder như CI) + **đọc build output xác nhận render strategy §3: /books, /books/[book], /books/[book]/units/[unit] static (○/●), lesson ISR-on-demand** + full CI local + checklist đủ 4 trang mới.
- [ ] T11. Code-reviewer độc lập trên diff → fix → re-review; evidence `docs/superpowers/evidence/sf-2-content-public/test-run.txt`; audit log; commit cuối.

File structure: theo conventions SF-1 (server components + `src/lib/*` + messages per-namespace; components domain `src/components/content/`; scripts node type-strip dùng relative import — không alias `@/` trong scripts).

Testing strategy: Vitest unit localize + revalidateContent + parity messages (npm test, CI-safe); `test:rls` integration (cần DB local — config riêng, KHÔNG lọt `npm test`); build probe thiếu DB; browser 3 tầng Rule 0.

## 6. Risks & unknowns

- **Probe kết quả (2026-09-29):** pgView round-trip PASS; lame WAV→mp3 PASS (9.3KB/3s); node v24 type-strip PASS. Còn lại: `unstable_cache` + postgres.js serialization (verify ở T2).
- **Assumptions:** slug `level-1..level-7` ổn định (footer links contract — seed không đổi slug sau này); unit/lesson route param = number; CI không DB nên mọi cached query phải catch-safe.
- **Mitigations:** generateStaticParams `catch→[]`; scripts không dùng alias; test-rls config riêng không lọt CI; audio demo commit vào git (không phụ thuộc seed regenerate).

## Verification hooks

- Evidence: `docs/superpowers/evidence/sf-2-content-public/test-run.txt` (HEAD hash + `tdd:` line) — slug đúng bracket `sf-2-content-public`.
- Reviewer: verdict APPROVED kèm CHECKLIST-4Q trên VU-17.
- Gate cuối: `~/.claude/bin/story-verify sf-2` sạch.

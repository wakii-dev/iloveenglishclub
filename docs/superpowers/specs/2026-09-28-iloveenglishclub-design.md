# I Love English Club — Design Document

**Date:** 2026-09-28
**Status:** Approved (brainstorming complete) · revised sau spec-critic + phase0-impact (2026-09-28)
**Product:** Website luyện nghe tiếng Anh bằng dictation, bám theo lộ trình sách Cambridge English Prepare (2nd Edition)

## 0. IDEA-BRIEF (story-workflow CREATE)

- **Task:** Xây web app luyện nghe tiếng Anh bằng dictation (nghe → gõ lại → kiểm tra word-diff → điểm), nội dung bám lộ trình 7 sách Cambridge English Prepare (Level 1 Pre-A1 → Level 7 B2 First, mỗi sách có units theo mục lục, mỗi unit có các bài dictation); kèm admin CMS nhập nội dung (script + audio người thu âm).
- **Output:** Production web app "I Love English Club" (Next.js + Supabase) — public site song ngữ EN/VI + admin panel, deploy Vercel + Supabase cloud.
- **Users:** (1) Học viên: người học tiếng Anh toàn trình độ A1→B2+, dùng desktop/web, cần đăng nhập để lưu tiến độ; (2) Admin: đội sản xuất nội dung (nhập units/lessons/script, upload audio thu âm sẵn).
- **Constraints:** MUST song ngữ EN/VI (i18n) · MUST audio người thật thu âm upload qua admin · MUST lưu tiến độ khi đăng nhập · MUST NOT copy script/audio sách Cambridge (script tự viết theo chủ đề unit) · v1 chỉ cấu trúc sách thuần túy (không Numbers/Spelling/Expressions/Pronunciation/TOEIC-IELTS/Blog).
- **Input:** Spec duyệt (file này) · site tham chiếu dailydictation.com (chỉ tính năng + mô hình sản phẩm, KHÔNG content) · audio thu âm sẵn của đội sản xuất.
- **Context:** Repo greenfield (trống code) · stack chốt Next.js 15 + Supabase · quản lý bằng story-workflow (epic + SF bracket).
- **Success criteria:** Mỗi phase shippable (build xanh + browser walkthrough gate); cuối story: học viên đăng ký → chọn sách → học lesson (nghe-gõ-check) → nhận XP/streak → thấy leaderboard + stats; admin tạo unit → lesson → bulk upload audio → publish → bài hiện trên site. Tất cả chạy thật trên production URL.
- **Out-of-scope (v1):** App mobile native · AI chấm phát âm · AI sinh nội dung · thanh toán/subscription · voice input (micro trên input — candidate v1.1) · các section ngoài sách (Numbers, Spelling, Expressions, Pronunciation, TOEIC/IELTS/TOEFL, Blog).

---

## 1. Overview

I Love English Club là website luyện nghe tiếng Anh theo phương pháp **dictation** (nghe → gõ lại → kiểm tra), lấy lộ trình 7 quyển sách **Cambridge English Prepare (2nd Edition)** làm cấu trúc nội dung duy nhất. Học viên chọn sách (Level 1–7) → học lần lượt theo Unit → làm các bài dictation theo chủ đề unit.

### Goals

- Sản phẩm thật, phục vụ người dùng ngoài (auth, lưu tiến độ, có thể monetize sau)
- Trải nghiệm dictation mượt, keyboard-first, phản hồi tức thì word-by-word
- Admin CMS tối ưu nhập liệu nhanh: script → auto-split câu → bulk upload audio người thu âm
- Gamification giữ chân: XP, streak, leaderboard
- Song ngữ EN/VI, SEO kỹ thuật đầy đủ

### Non-goals (v1)

- ❌ Sections: Numbers, Spelling Names, Expressions, Pronunciation (IPA), TOEIC/IELTS/TOEFL/OET, Blog, Video lessons
- ❌ App mobile native
- ❌ AI scoring/feedback phát âm, AI sinh nội dung
- ❌ Thanh toán/subscription (thiết kế để thêm sau nhưng không implement)

### Content policy (quan trọng)

Script và audio trong sách Cambridge Prepare là tài sản có bản quyền của Cambridge — **không copy vào site**. Nội dung site = script **tự viết** theo chủ đề từng unit (đúng tầm từ vựng/ngữ pháp của level) + audio **người thật thu âm** của đội sản xuất. Site là công cụ luyện tập bám theo lộ trình Prepare, không phải bản sao sách.

---

## 2. Product Structure

```
Home → 7 sách (Level 1–7)
  └── Book page: Units theo mục lục sách
        └── Unit page: Lessons dictation
              └── Lesson: /books/[book]/units/[unit]/lessons/[lesson]/listen-and-type
```

### Books (7, cố định)

| # | Nhãn | CEFR | Kỳ thi mục tiêu |
|---|---|---|---|
| 1 | Level 1 — Starter | Pre-A1 | — |
| 2 | Level 2 | A1 | Movers/Flyers |
| 3 | Level 3 | A2 | A2 Key (KET) for Schools |
| 4 | Level 4 | A2+ | Preliminary for Schools (cầu nối) |
| 5 | Level 5 | B1 | B1 Preliminary (PET) for Schools |
| 6 | Level 6 | B1+ | First for Schools (nâng cao) |
| 7 | Level 7 | B2 | B2 First (FCE) for Schools |

Mỗi book có: title_en/title_vi, cefr_label, exam_target, mô tả EN/VI, màu nhận diện. Books là seed data, không CRUD trong v1 admin (7 dòng cố định; chỉnh qua migration).

### Units

- Thuộc đúng 1 book, đánh số thứ tự theo mục lục sách (thường ~12–14 units/quyển)
- Trường: number, title_en, title_vi, mô tả ngắn desc_en/desc_vi (optional)
- Admin tự nhập theo sách đang dạy — không hardcode số lượng

### Lessons

- Thuộc 1 unit, một unit có nhiều lesson (vd: bài nghe từ vựng, bài nghe hội thoại của unit)
- Một lesson = 1 bài dictation: tập câu (parts) theo thứ tự + audio tương ứng
- kind duy nhất trong v1: `dictation`; vocab_level gắn trên lesson

### Phương pháp 4 bước (truyền thông trên landing)

Nghe audio → Gõ lại → Check & sửa lỗi → Đọc to (khuyến khích tự luyện nói)

---

## 3. Architecture

```
Next.js 15+ (App Router, TypeScript) — 1 codebase monolith
├── Public (SSG/ISR cho SEO)
│   ├── /[locale]/                     Home: 7 level cards + 4-step method
│   ├── /[locale]/books                Danh sách 7 books
│   ├── /[locale]/books/[book]         Units của sách
│   ├── /[locale]/books/[book]/units/[unit]      Lessons của unit
│   ├── /[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type
│   ├── /[locale]/top-users            Leaderboard
│   ├── /[locale]/login · /[locale]/register
│   └── /[locale]/me                   Stats cá nhân (heatmap, tiến độ)
├── /admin (role-gated, NGOÀI segment [locale]; UI tiếng Việt)
│   ├── Dashboard (số liệu tổng quan)
│   ├── Units CRUD · Lessons CRUD
│   ├── Lesson editor: script → split câu → bulk upload audio → preview
│   └── Users (xem/sửa role, khóa)
├── Server Actions + Route Handlers (API)
└── Supabase: Postgres + Auth + Storage (bucket audio)

Deploy: Vercel (app) + Supabase cloud (data)
Libs: next-intl, TailwindCSS + shadcn/ui, Zustand, supabase-js, diff tự viết word-level (KHÔNG dùng diff-match-patch — cần word-level có kiểm soát tokenization, xem §5)
```

- Audio: bucket `audio` layout `audio/{book}/{unit}/{lesson}/{NN}.mp3` (NN zero-pad 2 chữ số); access qua public URL; lưu `duration_ms` khi upload để hiển thị
- Storage abstraction mỏng (module `lib/storage.ts`) để sau này swap sang Cloudflare R2 nếu chi phí egress tăng
- **Render strategy:** books/units SSG; lesson pages render-on-demand + ISR (`dynamicParams = true` — tránh prerender hàng nghìn lesson × 2 locale làm nổ build time); revalidate bằng `revalidateTag('content')` gọi trong Server Action CRUD/publish — wire từ milestone 2, không để milestone 6
- `/admin` nằm NGOÀI segment `[locale]`; middleware next-intl exclude `/admin` tường minh (không sẽ bị redirect `/en/admin`)
- **Trust boundary:** client CHỈ gửi `typed_text` + `client_attempt_id`; mọi tính toán scoring/XP chạy **server-side** trong Server Action (dùng chung pure module diff với client cho preview) — không tin accuracy/wpm/xp client gửi
- Ghi XP dùng **service-role client phía server** (RLS cấm user tự sửa profiles.xp) qua single SQL statement atomic

---

## 4. Data Model (Postgres + RLS)

```
books                  id (1–7), slug, title_en, title_vi, cefr_label,
                       exam_target, desc_en, desc_vi, color, sort_order

units                  id, book_id → books, number, title_en, title_vi,
                       desc_en, desc_vi (optional), sort_order, created_at
                       UNIQUE (book_id, number)

lessons                id, unit_id → units, number, title_en, title_vi,
                       kind ('dictation'),
                       vocab_level enum('Pre-A1','A1','A2','A2+','B1','B1+','B2','B2+'),
                       sort_order, published (bool), created_at
                       UNIQUE (unit_id, number)

lesson_parts           id, lesson_id → lessons, sort_order,
                       text (câu tiếng Anh — transcript),
                       audio_path (nullable — draft chưa upload), duration_ms (nullable)
                       UNIQUE (lesson_id, sort_order)
                       DELETE RESTRICT khi part đã có attempts (lịch sử học + XP là dữ liệu
                       user — admin gỡ bài bằng unpublish lesson, không xóa part đã có người học)

profiles               id (= auth.users.id), display_name, avatar_url,
                       locale ('en'|'vi' — auto set theo route khi đăng ký),
                       role ('user'|'admin'), relaxed_mode (bool, default false),
                       xp int, streak_count int, last_active_date date
                       (xp/streak/last_active = CACHE; source of truth là attempts + daily_activity)

attempts               id, user_id → profiles, part_id → lesson_parts,
                       typed_text, accuracy real (0–1), wpm real, xp real,
                       client_attempt_id uuid, created_at
                       UNIQUE (user_id, part_id, client_attempt_id)  ← chống double-submit

user_lesson_progress   user_id, lesson_id, done_parts int, best_accuracy real, updated_at
                       UNIQUE (user_id, lesson_id)
                       (total_parts KHÔNG snapshot — tính live từ lesson, tránh lệch khi
                       admin sửa lesson sau khi học viên đã học)

daily_activity         user_id, date, parts_done int
                       UNIQUE (user_id, date)   ← date theo TZ Asia/Ho_Chi_Minh

leaderboard            = SQL view: xp tuần ISO (Mon–Sun, TZ Asia/Ho_Chi_Minh, tính từ
                       attempts.xp) + all-time (từ profiles.xp); chỉ expose
                       display_name + avatar + xp
```

**RLS policies:**
- Nội dung (`books/units/lessons/parts`): SELECT cho `anon` + `authenticated` (lesson chỉ row `published = true` với anon — draft chỉ admin thấy); INSERT/UPDATE/DELETE chỉ role `admin`
- **Transcript cho anon đọc được là chấp nhận có chủ đích:** sản phẩm có tab Full transcript công khai (mô hình như DailyDictation) — đáp án không phải thông tin cần bảo mật; không tách bảng answer trong v1
- `profiles`: user đọc row của mình, chỉ được sửa display_name/avatar_url/locale/relaxed_mode (không tự sửa `xp`, `role`, `streak` — cập nhật qua service-role action); public SELECT id/display_name/avatar_url/xp cho leaderboard
- `attempts`, `user_lesson_progress`, `daily_activity`: user chỉ đọc/ghi của mình (insert attempts; update progress)
- Leaderboard view: public read

**Tính XP (chốt cứng — xem §5 Scoring rules):**
- XP chỉ cộng ở **attempt đầu tiên** user hoàn thành một part (attempts sau vẫn log đầy đủ nhưng `xp = 0` — chống farm); modifiers: dùng hint ×0.8, relaxed mode ×0.5 (chốt — dễ hơn thì ít điểm hơn)
- Server Action submit attempt chạy bằng service-role client phía server, trong MỘT transaction: (1) insert attempt (unique constraint chặn double-submit); (2) nếu là attempt đầu của part → `update profiles set xp = xp + $1` (single statement atomic, không read-modify-write); (3) upsert `daily_activity` với `ON CONFLICT parts_done = parts_done + $1`; (4) recompute streak từ daily_activity (source of truth), ghi cache vào profiles
- Streak: "hôm nay/hôm qua" theo **TZ cố định Asia/Ho_Chi_Minh** (tệp người học VN — đơn giản, ghi vào code); `last_active_date = hôm qua` → streak+1; `= hôm nay` → giữ; khác → reset 1

---

## 5. Dictation Engine (core UX)

Trang lesson, tab **Dictation**:

1. **Start gate:** màn **Start** với nút "Bắt đầu" trước câu đầu — tap nút = user gesture để qua chính sách autoplay của browser (navigate không tính là gesture); sau đó auto-play từng câu hợp lệ
2. **Play:** nút Play/Replay (phím `Tab`), tốc độ 0.5x / 0.75x / 1x / 1.25x / 1.5x (nút + phím `←`/`→` tua ±3s); preload audio câu kế
3. **Gõ:** input 1 dòng; `Enter` = check (không xuống dòng); paste bị chặn; input đặt `autocapitalize=off, autocorrect=off, spellcheck=false` (mobile accuracy)
4. **Flow check/sửa (state machine — chốt cứng):**
   - Chưa check: `Enter` = **check** (gửi submit)
   - Sau check còn từ sai: user sửa input → `Enter` = **check lại** (không giới hạn số lần — khớp phương pháp "Check & sửa lỗi"); nút **"Câu tiếp"** luôn hiển thị sau lần check đầu
   - Đúng hết: banner "Chính xác!" — `Enter` hoặc nút "Câu tiếp" = sang câu kế
   - **Hint** (`Ctrl+Shift+/`): lộ MỘT từ đầu tiên chưa đúng, dùng bao nhiêu lần cũng được nhưng part đó bị đánh dấu "đã dùng hint" (XP ×0.8)
   - **Skip:** đánh dấu part `skipped` — không cộng XP, KHÔNG tính vào done_parts
5. **Scoring rules (chốt cứng — test contract của diff module):**
   - Tokenize theo khoảng trắng; chuẩn hóa apostrophe cong `’` → `'`; contraction = 1 token ("don't" là 1 token)
   - **Strict mode (mặc định):** phân biệt hoa/thường, dấu câu đính vào token tính là khác ("cat." ≠ "cat")
   - **Relaxed mode** (setting `profiles.relaxed_mode`, toggle trong lesson, lưu theo user): không phân biệt hoa/thường + strip dấu câu khỏi token
   - `accuracy = matched / transcript_word_count` (mẫu số là **transcript**, không phải input), scale 0–1
   - `wpm` tính theo **duration audio gốc** (không theo tốc độ phát)
   - XP = `round(10 × accuracy × hintModifier × relaxedModifier)`, chỉ attempt đầu của part (attempts sau xp=0)
   - Client chỉ gửi `typed_text` + `client_attempt_id`; server recompute toàn bộ (cùng pure module)
6. **Progress + part navigation:** thanh tiến độ (done parts / tổng — skip không tính); thanh điều hướng **`← 1/21 →`** trên đầu exercise (giống DailyDictation) — qua lại giữa các part ĐÃ xong để xem lại; part chưa xong không nhảy tới (sequential); các part xong thu gọn thành câu đã đúng, sai highlight
   - Visual reference (từ screenshot DailyDictation): tabs Dictation | Full transcript trên đầu card; player inline (play, timeline, volume, speed 1x dropdown); textarea "Type what you hear..."; nút Check (primary) + Skip (secondary); Settings góc phải (relaxed mode, tốc độ mặc định)
7. **Kết thúc:** lesson xong khi **mọi part done-or-skipped** → màn kết quả: accuracy TB các part done, XP nhận, streak hiện tại, nút "Bài tiếp theo"; % lessons done trên /me chỉ tính lesson **0 skipped**
8. **Persist per-part NGAY khi check** (đăng nhập) — thoát giữa chừng vẫn giữ điểm; **guest:** state in-memory (XP live hiển thị ephemeral, banner rõ "đăng nhập để lưu"); guest login GIỮA lesson → toàn bộ in-memory results được commit như user thường (không mất trắng)
9. **Tab Full transcript:** xem toàn bộ text các câu + audio player tổng (bật sau khi bắt đầu lesson)
10. Diff + scoring là **pure module** (`lib/dictation/diff.ts`) — tokenize/normalize/match/accuracy/XP — Vitest coverage 100% nhánh theo bảng scoring rules trên; player là Zustand store thuần (`lib/dictation/store.ts`) — state machine ở mục 4 — test không cần DOM

**Shortcuts:** `Tab` replay (trong exercise — input là field duy nhất, Tab-không-replay không có gì để điều hướng tới; ghi chú a11y rationale, review lại ở audit M6) · `Enter` check/next · `Ctrl+Shift+/` hint (keycap thật của Ctrl+?) · `Esc` pause. Panel hướng dẫn phím tắt luôn xem được.

---

## 6. Admin CMS

Nguyên tắc thiết kế: **tối ưu tốc độ nhập liệu** vì mỗi tuần nhập nhiều lesson với audio thu âm sẵn.

1. **Tạo Unit**: chọn book → nhập số unit + tên chủ đề EN/VI
2. **Tạo Lesson**: chọn unit → title + vocab_level
3. **Lesson editor** (màn chính):
   - Dán script → nút **Split sentences** (chia theo `.?!`; known-limitation hiển thị ngay trong UI: viết tắt Mr./e.g., số thập phân 3.5, ellipsis có thể tách sai — cho phép gộp/tách/thêm/xóa từng dòng thủ công)
   - **Bulk upload audio: upload TRỰC TIẾP browser → Supabase Storage** (supabase-js, KHÔNG qua Server Action — body limit ~1MB sẽ chết với 50 file); **per-file status + retry riêng file fail**
   - **Mapping:** parse số đầu tên file (`01.mp3`, `1.mp3` — sort NUMERIC, không lexicographic vì `10.mp3` < `2.mp3`); auto-map theo index với câu; drag để đổi vị trí; replace từng file
   - **Mismatch handling:** part thiếu audio → trạng thái "chưa ghép" hiển thị rõ; file thừa câu → warning liệt kê; file sai định dạng/không phải audio → per-file error
   - `duration_ms` đọc client-side (Audio metadata); fail mềm (null) không block
   - **Publish gate (validation bắt buộc):** mọi part phải có text + audio_path (duration nullable OK) — thiếu thì KHÔNG publish được (chặn broken lesson cho học viên)
   - Published lesson: sửa text/thay audio vẫn OK (revalidate); **không được xóa part** đã có attempts (DB RESTRICT); gỡ bài = unpublish
4. **Dashboard**: số lessons/parts theo book, bài nháp chưa publish, users mới, attempts gần đây
5. **Users**: tìm kiếm, đổi role, khóa

Auth admin: Supabase Auth, role trong `profiles.role`; middleware chặn `/admin` cho non-admin; mọi Server Action ghi nội dung **kiểm tra role='admin' lại ở server bằng service-role client** (không tin middleware một mình).

---

## 7. Gamification & Stats

- **XP**: theo bảng scoring §5 (first-attempt, modifiers); hiển thị live trong lesson (ephemeral với guest)
- **Streak**: học ≥1 part/ngày (TZ Asia/Ho_Chi_Minh) giữ chuỗi; header + /me; source of truth `daily_activity`, profiles là cache
- **Leaderboard** `/top-users`: bảng tuần (ISO Mon–Sun) + all-time; hiển thị avatar + display_name + xp (trùng tên hiếm gặp — chấp nhận, có avatar phân biệt)
- **/me**: tổng parts done, accuracy TB, **tổng phút nghe = tổng duration các part DISTINCT đã nghe (đếm mỗi part 1 lần — làm lại không đếm kép)**, heatmap lịch học 12 tuần (daily_activity), tiến độ từng book (% lessons done, yêu cầu 0 skipped)

---

## 8. i18n & SEO

- **next-intl**, route prefix `/en` (default) và `/vi`; redirect `/` → `/en`; messages `en.json`/`vi.json`, fallback vi→en
- Content bilingual: cột `_en`/`_vi` trên books/units/lessons; **fallback render chain `vi → en → raw`** cho mọi cột content (thiếu bản dịch thì hiện tiếng Anh, không hiện rỗng); validation publish **bắt buộc có title_en** (tiếng Việt có thể bổ sung sau); transcript lesson chỉ tiếng Anh
- `profiles.locale` auto-set theo route locale khi đăng ký; UI language switch = đổi route locale
- **SEO**: books/units SSG + lesson ISR (đúng render strategy §3), `generateMetadata` theo locale, sitemap.xml tự sinh từ DB (chỉ published), JSON-LD (`LearningResource`/`Course`), OG image động cho lesson, canonical + hreflang cặp theo locale, freshness qua `revalidateTag('content')` khi admin CRUD/publish

---

## 9. Testing

| Lớp | Công cụ | Phạm vi + ngưỡng |
|---|---|---|
| Unit | Vitest | diff/scoring 100% nhánh theo bảng §5, XP/streak logic (TZ + modifiers), split-sentences |
| Component | Vitest + Testing Library | Player state machine (§5.4), input handlers, admin editor mapping |
| E2E | Playwright | dictation happy path (guest + user + login-giữa-lesson), login, admin tạo lesson end-to-end, i18n switch |
| DB | Supabase local + test script chạy policies | RLS từng role (anon/user/admin): đọc được gì, bị chặn gì — script assert, không chỉ kiểm tay |
| Audit M6 | Lighthouse | **a11y ≥ 95, perf mobile ≥ 85** (ngưỡng binary) |

---

## 10. Milestones (thứ tự triển khai)

1. **Foundation** — repo scaffold Next.js + TS + Tailwind + shadcn/ui, Supabase project (**chọn region gần VN** — quyết định 1 lần khó đổi), **tạo bucket `audio` + policies**, Auth email/password + Google (pattern `@supabase/ssr` hiện hành — auth-helpers đã deprecated), next-intl, design system cơ bản, CI. *Probe: pattern @supabase/ssr + Next 15 middleware, cách exclude /admin, tên env vars chốt.*
2. **Model sách + trang public** — schema migration (ĐẦY ĐỦ theo §4: có sẵn `attempts.xp`, `client_attempt_id`, `relaxed_mode` — rẻ hơn thêm sau) + RLS + seed 7 books + seed demo units/lessons/parts (audio placeholder — đội thu âm thay sau qua admin), trang Home/Books/Book/Unit + placeholder lesson page, **wire revalidateTag từ đầu**. *Probe: Vercel build reach Supabase, thời gian build, revalidate locale path vs tag.*
3. **Dictation engine** ⭐ — Start gate, player, input, diff theo §5, state machine §5.4, kết quả, shortcuts. *Probe: playbackRate 0.5x/1.5x iOS Safari thiết bị thật.*
4. **Admin CMS** — units/lessons CRUD, lesson editor + bulk audio direct-to-storage, publish gate, role-gating service-role. *Probe: xin sớm sample audio của đội thu âm (codec/bitrate → độ tin cậy auto-đọc duration_ms), limit size Storage tier.*
5. **Progress + Gamification** — attempts/progress lưu thật qua service-role action, XP/streak/leaderboard, trang /me
6. **SEO + Production** — metadata/sitemap/JSON-LD/OG, audit a11y+perf theo ngưỡng §9, security checkpoint (secrets, RLS re-verify, role-check mọi action), deploy Vercel + Supabase production + smoke E2E

Mỗi milestone = một sub-project có spec slice → plan → implementation riêng (story-workflow bracket).

---

## 11. Quyết định đã chốt (từ brainstorming + critics 2026-09-28)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Mục đích | Sản phẩm thật cho người dùng ngoài |
| 2 | Nguồn audio | Người thật thu âm, upload qua admin |
| 3 | Stack | Next.js full-stack monolith + Supabase |
| 4 | Phạm vi nội dung v1 | Chỉ sách thuần túy (7 levels → units → lessons) |
| 5 | Tên sản phẩm | I Love English Club |
| 6 | Ngôn ngữ UI | Song ngữ EN/VI (i18n) |
| 7 | Phân loại | Theo sách Cambridge Prepare: level → unit → lesson; không có topic tự do |
| 8 | Gamification | Giữ: XP, streak, leaderboard, stats |
| 9 | Autoplay | Màn Start (user gesture) trước câu đầu — qua autoplay policy |
| 10 | XP economy | Chỉ attempt đầu của part được XP; hint ×0.8; relaxed ×0.5; server recompute từ typed_text |
| 11 | Transcript anon-read | Chấp nhận có chủ đích (Full transcript công khai như DailyDictation) |
| 12 | Bulk upload | Direct browser → Storage (không qua Server Action); publish gate đủ audio |
| 13 | Timezone | Cố định Asia/Ho_Chi_Minh cho mọi date logic (streak, leaderboard tuần ISO) |
| 14 | Flow check | Check lại không giới hạn khi sai; nút "Câu tiếp"/Enter-đúng để advance; skip không tính done |
| 15 | Xóa nội dung có người học | Part có attempts: DELETE RESTRICT; gỡ bài bằng unpublish |
| 16 | Render | Books/units SSG; lesson ISR on-demand; revalidateTag('content') từ M2 |

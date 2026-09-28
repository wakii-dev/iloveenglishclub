# I Love English Club — Design Document

**Date:** 2026-09-28
**Status:** Approved (brainstorming complete)
**Product:** Website luyện nghe tiếng Anh bằng dictation, bám theo lộ trình sách Cambridge English Prepare (2nd Edition)

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

Mỗi book có: title, cefr_label, exam_target, mô tả EN/VI, màu nhận diện. Books là seed data, không CRUD trong v1 admin (7 dòng cố định; chỉnh qua migration).

### Units

- Thuộc đúng 1 book, đánh số thứ tự theo mục lục sách (thường ~12–14 units/quyển)
- Trường: number, title_en, title_vi, mô tả ngắn (optional)
- Admin tự nhập theo sách đang dạy — không hardcode số lượng

### Lessons

- Thuộc 1 unit, một unit có nhiều lesson (vd: bài nghe từ vựng, bài nghe hội thoại của unit)
- Một lesson = 1 bài dictation: tập câu (parts) theo thứ tự + audio tương ứng
- kind duy nhất trong v1: `dictation`; vocab_level (A1–B2+) gắn trên lesson

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
├── /admin (role-gated, locale=vi mặc định)
│   ├── Dashboard (số liệu tổng quan)
│   ├── Units CRUD · Lessons CRUD
│   ├── Lesson editor: script → split câu → bulk upload audio → preview
│   └── Users (xem/sửa role, khóa)
├── Server Actions + Route Handlers (API)
└── Supabase: Postgres + Auth + Storage (bucket audio)

Deploy: Vercel (app) + Supabase cloud (data)
Libs: next-intl, TailwindCSS + shadcn/ui, Zustand, supabase-js, diff-match-patch (tự wrap)
```

- Audio: bucket `audio` layout `audio/{book}/{unit}/{lesson}/{NN}.mp3`; access qua public URL (hoặc signed URL nếu cần); lưu `duration_ms` khi upload để hiển thị
- Storage abstraction mỏng (module `lib/storage.ts`) để sau này swap sang Cloudflare R2 nếu chi phí egress tăng

---

## 4. Data Model (Postgres + RLS)

```
books                  id (1–7), slug, title, cefr_label, exam_target,
                       desc_en, desc_vi, color, sort_order

units                  id, book_id → books, number, title_en, title_vi,
                       sort_order, created_at
                       UNIQUE (book_id, number)

lessons                id, unit_id → units, number, title_en, title_vi,
                       kind ('dictation'), vocab_level ('A1'..'B2+'),
                       sort_order, published (bool), created_at
                       UNIQUE (unit_id, number)

lesson_parts           id, lesson_id → lessons, sort_order,
                       text (câu tiếng Anh — transcript),
                       audio_path, duration_ms

profiles               id (= auth.users.id), display_name, avatar_url,
                       locale ('en'|'vi'), role ('user'|'admin'),
                       xp int, streak_count int, last_active_date date

attempts               id, user_id → profiles, part_id → lesson_parts,
                       typed_text, accuracy real, wpm real, created_at

user_lesson_progress   user_id, lesson_id, done_parts int, total_parts int,
                       best_accuracy real, updated_at
                       UNIQUE (user_id, lesson_id)

daily_activity         user_id, date, parts_done int
                       UNIQUE (user_id, date)

leaderboard            = SQL view: tổng xp theo tuần (từ attempts có điểm)
                       và all-time (từ profiles.xp)
```

**RLS policies:**
- Nội dung (`books/units/lessons/parts`): SELECT cho `anon` + `authenticated` (chỉ row `published = true` với lesson); INSERT/UPDATE/DELETE chỉ role `admin`
- `profiles`: user đọc/sửa row của mình (không tự sửa `xp`, `role` — xp cập nhật qua service action có kiểm soát)
- `attempts`, `user_lesson_progress`, `daily_activity`: user chỉ đọc/ghi của mình
- Leaderboard view: public read, không lộ dữ liệu nhạy cảm

**Tính XP:** mỗi part: `xp = round(10 × accuracy)`; cộng vào `profiles.xp` + `daily_activity.parts_done` trong cùng một transaction (Server Action). Streak: nếu `last_active_date = hôm qua` → `streak_count + 1`; nếu = hôm nay → giữ; khác → reset về 1.

---

## 5. Dictation Engine (core UX)

Trang lesson, tab **Dictation**:

1. **Play**: auto-play câu đầu. Nút Play/Replay (shortcut `Tab`), tốc độ 0.5x / 0.75x / 1x / 1.25x / 1.5x (nút + phím `←`/`→` tua ±3s)
2. **Gõ**: input 1 dòng; `Enter` = check (không xuống dòng); paste bị chặn
3. **Check**: word-level diff hiển thị ngay dưới input — đúng (xanh), sai (đỏ, kèm từ đúng). Toggle **Relaxed mode** (bỏ qua hoa/thường + dấu câu) lưu theo user. Tính `accuracy` = từ đúng / tổng từ, `wpm` = từ / phút nghe
4. **Score + chuyển câu**: XP cộng dồn live; `Enter` lần 2 → sang câu tiếp; nút Hint (lộ từ đầu tiên chưa đúng), Skip (không tính điểm), lại từ đầu
5. **Progress**: thanh tiến độ trên đầu (parts hoàn thành / tổng);completed parts thu gọn thành câu đã đúng, sai highlight
6. **Kết thúc**: màn kết quả — accuracy trung bình, XP nhận, streak hiện tại, nút "Bài tiếp theo"; cập nhật progress + attempts + daily_activity (login mới lưu — banner nhắc đăng nhập cho guest)
7. **Tab Full transcript**: xem toàn bộ text các câu + audio player tổng (bật sau khi bắt đầu lesson)

Diff + scoring là **pure module** (`lib/dictation/diff.ts`) — token hóa, so khớp thứ tự từ, tính accuracy — Vitest coverage cao nhất ở đây. Player là Zustand store thuần (`lib/dictation/store.ts`) cũng test được không cần DOM.

**Shortcuts:** `Tab` replay · `Enter` check/next · `Ctrl+?` hint · `Esc` pause. Panel hướng dẫn phím tắt luôn xem được.

---

## 6. Admin CMS

Nguyên tắc thiết kế: **tối ưu tốc độ nhập liệu** vì mỗi tuần nhập nhiều lesson với audio thu âm sẵn.

1. **Tạo Unit**: chọn book → nhập số unit + tên chủ đề EN/VI
2. **Tạo Lesson**: chọn unit → title + vocab_level
3. **Lesson editor** (màn chính):
   - Dán script → nút **Split sentences** (chia câu theo dấu chấm/`?`/`!`, cho phép gộp/tách/thêm/xóa từng dòng thủ công) → preview danh sách parts
   - **Bulk upload**: kéo thả nhiều file audio (đặt tên `01.mp3, 02.mp3`… hoặc chọn theo thứ tự) → map tự động theo index với câu; drag để đổi vị trí; replace từng file
   - Play từng câu để kiểm chứng khớp text ↔ audio; tự đọc `duration_ms`
   - **Publish** lesson (nháp → published)
4. **Dashboard**: số lessons/parts theo book, bài chưa publish, users mới, attempts gần đây
5. **Users**: tìm kiếm, đổi role, khóa

Auth admin: Supabase Auth, role trong `profiles.role`; middleware chặn `/admin` cho non-admin; mọi Server Action ghi nội dung kiểm tra role lại ở server.

---

## 7. Gamification & Stats

- **XP**: +10 × accuracy mỗi part; hiển thị live trong lesson
- **Streak**: học ≥1 part/ngày giữ chuỗi; hiển thị ở header + trang /me
- **Leaderboard** `/top-users`: bảng tuần (xp từ attempts 7 ngày) + all-time; chỉ hiện display_name + avatar + xp
- **/me**: tổng parts đã hoàn thành, accuracy TB, tổng phút nghe (tổng duration attempts), heatmap lịch học 12 tuần (từ daily_activity), tiến độ từng book (% lessons done)

---

## 8. i18n & SEO

- **next-intl**, route prefix `/en` (default) và `/vi`; redirect `/` → `/en`
- UI strings: 2 file message `en.json`, `vi.json`
- Content: cột `_en`/`_vi` trên books/units/lessons (transcript lesson chỉ tiếng Anh)
- **SEO**: SSG/ISR mọi trang books/units/lessons (kể cả cho guest), `generateMetadata` theo locale, sitemap.xml tự sinh từ DB, JSON-LD (`LearningResource`/`Course`), OG image động cho lesson, canonical + hreflang

---

## 9. Testing

| Lớp | Công cụ | Phạm vi |
|---|---|---|
| Unit | Vitest | diff/scoring (100% nhánh), XP/streak logic, split-sentences |
| Component | Vitest + Testing Library | Player states, input handlers, admin editor |
| E2E | Playwright | dictation happy path (guest + user), login, admin tạo lesson end-to-end, i18n switch |
| DB | Supabase local + kiểm tra tay | RLS policies từng role |

---

## 10. Milestones (thứ tự triển khai)

1. **Foundation** — repo scaffold Next.js + TS + Tailwind + shadcn/ui, Supabase project, Auth (email/password + Google), next-intl, design system cơ bản, CI
2. **Model sách + trang public** — schema books/units/lessons/parts, seed 7 books, trang Home/Books/Book/Unit, seed dữ liệu demo
3. **Dictation engine** ⭐ — player, input, diff, scoring, kết quả, shortcuts (đứng trên lesson page có sẵn)
4. **Admin CMS** — units/lessons CRUD, lesson editor + bulk audio, role-gating
5. **Progress + Gamification** — attempts/progress lưu thật, XP/streak/leaderboard, trang /me
6. **SEO + Production** — metadata/sitemap/JSON-LD/OG, audit a11y + perf, deploy Vercel + Supabase production

Mỗi milestone = một sub-project có spec → plan → implementation riêng (dùng story-workflow/epic nếu chạy song song).

---

## 11. Quyết định đã chốt (từ brainstorming 2026-09-28)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Mục đích | Sản phẩm thật cho người dùng ngoài |
| 2 | Nguồn audio | Người thật thu âm, upload qua admin |
| 3 | Stack | Next.js full-stack monolith + Supabase |
| 4 | Phạm vi nội dung v1 | Chỉ sách thuần túy (7 levels → units → lessons) |
| 5 | Tên sản phẩm | I Love English Club |
| 6 | Ngôn ngữ UI | Song ngữ EN/VI (i18n) |
| 7 | Phân loại | Theo sách Cambridge Prepare: level → unit → lesson; không có topic tự do |
| 8 | Gamification | Giữ: XP, streak, leaderboard, stats (từ lựa chọn v1) |

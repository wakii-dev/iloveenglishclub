# SF-2 Context Pack — Content model + public pages

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md`. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)

1. **Migration schema ĐẦY ĐỦ spec §4** — không cắt xuống milestone sau: `books` (title_en/vi, cefr_label, exam_target, desc_en/vi, color), `units` (UNIQUE book_id+number, desc_en/vi optional), `lessons` (vocab_level enum Pre-A1…B2+, published, UNIQUE unit_id+number), `lesson_parts` (text, audio_path nullable, duration_ms nullable, UNIQUE lesson_id+sort_order, **DELETE RESTRICT khi có attempts** — quyết định #15), `profiles` (locale, role, **relaxed_mode**, xp, streak_count, last_active_date), `attempts` (**xp real, client_attempt_id uuid, UNIQUE user+part+client_attempt_id**), `user_lesson_progress` (done_parts, best_accuracy — KHÔNG total_parts snapshot), `daily_activity` (UNIQUE user+date), leaderboard view (tuần ISO Mon–Sun TZ Asia/Ho_Chi_Minh từ attempts.xp + all-time từ profiles.xp, chỉ expose display_name/avatar/xp)
2. **TRIGGER `on_auth_user_created` → insert profiles** (Supabase Auth không tự tạo row — plan-critic P1); assert trong RLS test script
3. **RLS theo spec §4**: content SELECT anon+authenticated (lesson published-only với anon), INSERT/UPDATE/DELETE admin-only; profiles user đọc row mình + sửa display_name/avatar/locale/relaxed_mode (KHÔNG tự sửa xp/role/streak); attempts/progress/daily_activity owner-only; leaderboard public read. **Test script assert từng role (anon/user/admin) đọc được gì, bị chặn gì — script tự chạy, không kiểm tay**
4. **Seed**: 7 books đúng bảng §2 (Level 1 Pre-A1 Starter → Level 7 B2 First, exam_target Movers/Flyers · A2 Key · Preliminary · PET · First); demo units/lessons/parts — **exit criteria: ≥1 lesson demo đủ audio PHÁT ĐƯỢC trên bucket (file mp3 thật upload lên bucket, audio_path set) + published=true** (plan-critic P1 — chỉ text chưa đủ cho gate SF-4)
5. **content-queries-lib** (`lib/content/queries.ts`): getBooks/getBook/getUnits/getUnit/getLessons/getLesson — **fallback chain `vi → en → raw`** cho mọi cột content (plan-critic P2: ghi rõ trong exit criteria)
6. **Trang public**: Home thật (7 level cards + 4-step method), `/books`, `/books/[book]` (units), `/books/[book]/units/[unit]` (lessons), placeholder lesson page (title + parts count + link mù — player là SF-4)
7. **Render strategy §3**: books/units SSG; lesson placeholder ISR on-demand; **wire `revalidateTag('content')` từ đầu** (helper dùng chung, Server Action publish của SF-5 gọi lại được)
8. demo audio placeholder: file mp3 tự sinh/generate ngắn (vài giây) đủ phát — KHÔNG dùng audio có bản quyền

## Touch map (files SF-2 tạo/sở hữu)

```
supabase/migrations/0001_init.sql (toàn bộ schema + RLS + trigger + view)
supabase/seed.sql hoặc seed script
scripts/test-rls.* (rls test script)
src/lib/content/queries.ts
src/lib/revalidate.ts (revalidateTag helper)
src/app/[locale]/page.tsx (Home thật — THAY placeholder SF-1)
src/app/[locale]/books/page.tsx
src/app/[locale]/books/[book]/page.tsx
src/app/[locale]/books/[book]/units/[unit]/page.tsx
src/app/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type/page.tsx (PLACEHOLDER)
messages/{en,vi}/home.json + books.json (namespace của SF-2)
```
READ-ONLY: `lib/supabase/*`, `lib/i18n/*`, `components/ui/*`, `components/layout/*` (SF-1)

## ACCEPTANCE (user-visible)

- Mở `/books` thấy đúng 7 sách với nhãn CEFR + kỳ thi mục tiêu; vào 1 sách thấy danh sách units theo số thứ tự; vào unit thấy lessons; vào lesson placeholder thấy title + số câu
- Home hiện 7 level cards + khối 4-step method
- Lesson demo có audio phát được (bấm play ra tiếng) — nền cho gate SF-4
- Bài có title_vi thiếu → hiện fallback tiếng Anh, không rỗng
- RLS test script chạy exit 0: anon đọc được published, không sửa được gì; user A không đọc data user B; non-admin không ghi được content

## Boundary (KHÔNG làm)

- KHÔNG implement player/trang dictation (SF-4 — chỉ placeholder tĩnh)
- KHÔNG admin UI (SF-5) — seed qua SQL/script, không qua admin
- KHÔNG attempts/XP/progress ghi data (SF-6) — chỉ tạo bảng + RLS
- KHÔNG metadata SEO/sitemap (SF-7)
- Merge convention (song song với SF-3): sau merge regen lockfile, không resolve tay

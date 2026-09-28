# SF-5 Context Pack — Admin CMS

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§6 là contract**, §3 trust boundary, §4 DELETE RESTRICT. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-5 chịu trách nhiệm)

1. **Admin layout + role-gating (§6):** `/admin` NGOÀI `[locale]`, UI tiếng Việt; middleware chặn non-login + mọi Server Action ghi **kiểm tra role='admin' lại ở server bằng service-role client** (không tin middleware một mình — spec §3)
2. **Dashboard:** số lessons/parts theo book, bài nháp chưa publish, users mới, attempts gần đây
3. **Units CRUD:** chọn book → number + title_en/vi + desc (optional)
4. **Lessons CRUD:** chọn unit → title + vocab_level (enum Pre-A1…B2+) + nháp/publish
5. **Lesson editor (§6.3):**
   - Dán script → **Split sentences** (IMPORT module `split-sentences` từ SF-3 — edge SF-5→SF-3) → manual fix UI: gộp/tách/thêm/xóa từng dòng
   - **Bulk upload DIRECT browser → Supabase Storage qua `lib/storage.ts`** (supabase-js; KHÔNG qua Server Action — body limit ~1MB chết với 50 file); **per-file status + retry riêng file fail**
   - **Mapping:** parse số đầu tên file (`01.mp3`, `1.mp3`) — **sort NUMERIC** (lexicographic sai: `10.mp3` < `2.mp3`); auto-map theo index; drag đổi vị trí; replace từng file
   - **Mismatch:** part thiếu audio → trạng thái "chưa ghép" rõ ràng; file thừa → warning liệt kê; file sai định dạng → per-file error
   - `duration_ms` đọc client-side (Audio metadata) — fail mềm null không block
   - **Publish gate:** mọi part phải có text + audio_path — thiếu KHÔNG publish được
   - Published lesson: sửa/thay audio OK (+revalidate); **KHÔNG được xóa part đã có attempts** (DB RESTRICT — UI disable + thông báo); gỡ bài = unpublish
6. **Users management:** tìm kiếm, đổi role, khóa
7. **E2E (Playwright):** admin tạo lesson end-to-end — spec §9
8. `lib/storage.ts`: implement đầy đủ abstraction (SF-1 chỉ có skeleton) — path convention `audio/{book}/{unit}/{lesson}/{NN}.mp3` NN zero-pad 2 chữ số

## Touch map (files SF-5 tạo/sở hữu)

```
src/app/admin/layout.tsx (bổ sung), page.tsx (dashboard), units/*, lessons/*, users/*
src/lib/actions/admin/*.ts (server actions — role check service-role)
src/lib/storage.ts (implementation đầy đủ)
src/components/admin/* (editor, uploader, mapping table, preview player)
messages/{en,vi}/admin.json
playwright tests: e2e/admin-lesson.spec.ts
```
READ-ONLY: schema/migrations (SF-2 — thiếu cột thì FLAG, không tự migration), `lib/dictation/split-sentences` (SF-3 import), `lib/supabase/admin` (SF-1), `components/ui`

## ACCEPTANCE (user-visible)

- Login admin → `/admin` thấy dashboard số liệu; non-admin vào `/admin` bị chặn (cả UI lẫn gọi thẳng action)
- Tạo unit mới → tạo lesson → dán script → split → thấy đúng N dòng, sửa tay được
- Kéo thả 5 file `01.mp3`…`05.mp3` → map đúng thứ tự số vào 5 câu; file 3 fail → retry riêng file 3 được
- Thiếu audio 1 part → nút Publish bị chặn kèm thông báo rõ; đủ → Publish → mở placeholder lesson page public thấy bài + audio phát được (gate đo trên placeholder SF-2 + revalidateTag firing — KHÔNG đòi trang dictation SF-4 đang song song)
- Published lesson: nút xóa part bị disable kèm giải thích RESTRICT; unpublish được

## Boundary (KHÔNG làm)

- KHÔNG đụng trang dictation SF-4 (song song — gate chỉ đo placeholder)
- KHÔNG attempts/XP/leaderboard (SF-6), KHÔNG SEO metadata (SF-7)
- KHÔNG đổi schema — thiếu gì flag coordinator cho SF-2 xử lý
- Merge convention (song song với SF-4): sau merge regen lockfile, không resolve tay

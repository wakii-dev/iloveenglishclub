# SF-4 Context Pack — Dictation UI lesson page

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§5 toàn bộ là contract**. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-4 chịu trách nhiệm)

1. **Start gate (§5.1):** màn "Bắt đầu" trước câu đầu — tap nút = user gesture qua autoplay policy; sau đó auto-play từng câu hợp lệ (probe iOS Safari nếu có thiết bị)
2. **Player controls (§5.2):** play/replay (phím `Tab`), tốc độ 0.5x/0.75x/1x/1.25x/1.5x, seek ±3s (`←`/`→`), preload câu kế; layout tham chiếu screenshot DailyDictation (tabs trên đầu, player inline, textarea, Check/Skip, Settings góc phải)
3. **Input (§5.3):** textarea "Type what you hear..."; `Enter` = check; paste bị chặn; `autocapitalize=off, autocorrect=off, spellcheck=false`
4. **Flow check/sửa — state machine §5.4 (import store SF-3):** Enter chưa check = check; còn từ sai → sửa → check lại không giới hạn; nút "Câu tiếp" hiện sau lần check đầu; đúng hết → banner "Chính xác!" → Enter/nút = câu kế; **Hint** (`Ctrl+Shift+/`): lộ 1 từ đầu chưa đúng, part bị mark "đã hint" (XP ×0.8 — hiển thị); **Skip**: mark skipped, không XP, không done
5. **Word-diff display:** render kết quả diff SF-3 — đúng xanh, sai đỏ kèm từ đúng
6. **Relaxed mode toggle trong lesson** (plan-critic P1): guest = in-memory; user = update `profiles.relaxed_mode` (RLS cho phép tự sửa field này) — action nhỏ server-side
7. **Part navigation `← 1/21 →`** (§5.6): qua lại part ĐÃ xong để xem lại; part chưa xong không nhảy tới
8. **Progress bar** (done/tổng — skip không tính); part xong thu gọn thành câu đúng/sai highlight
9. **Màn kết quả** (§5.7): hiện khi mọi part done-or-skipped — accuracy TB, XP in-memory, streak placeholder, nút "Bài tiếp theo"
10. **Guest (§5.8):** kết quả in-memory ephemeral; **banner rõ "đăng nhập để lưu"**; XP header hiển thị ephemeral phải phân biệt với user thật (plan-critic P1 cột b — không nhầm là đã lưu); commit-when-login là SF-6
11. **Tab Full transcript** (§5.9): toàn bộ text + audio player tổng, bật sau khi bắt đầu
12. **Shortcuts panel:** Tab replay · Enter check/next · Ctrl+Shift+/ hint · Esc pause — panel xem được mọi lúc
13. **E2E (Playwright) scope: guest + ephemeral + banner** — happy path guest làm 1 bài demo (SF-2 seed). Login-giữa-lesson-commit thuộc SF-6

## Touch map (files SF-4 tạo/sở hữu)

```
src/app/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type/page.tsx (THAY placeholder SF-2)
src/components/dictation/* (start-gate, player, input, diff-display, hint-skip-actions, part-nav, progress-bar, transcript-tab, results, shortcuts-panel, relaxed-toggle, login-banner)
src/lib/actions/relaxed-mode.ts (action nhỏ update profile)
messages/{en,vi}/lesson.json
playwright tests: e2e/dictation-guest.spec.ts
```
READ-ONLY: `lib/dictation/*` (SF-3 — bug lệch contract → báo coordinator, không sửa chéo), `lib/content/queries` (SF-2), `components/ui`, `lib/supabase/*`

## ACCEPTANCE (user-visible)

- Mở lesson demo → thấy nút Start → bấm → audio tự phát câu 1
- Gõ sai vài từ → Check → thấy từ đúng xanh / sai đỏ kèm từ đúng; sửa → Check lại được bao nhiêu lần cũng OK
- Hint lộ dần từng từ, part hiện mark đã-hint; Skip nhảy qua không tính tiến độ
- Điều hướng `← 1/21 →` xem lại part đã xong; không nhảy tới part chưa làm
- Làm hết → màn kết quả accuracy/XP; mobile: gõ không bị tự viết hoa/tự sửa
- Guest thấy banner "đăng nhập để lưu"; Full transcript tab mở được sau khi bắt đầu

## Boundary (KHÔNG làm)

- KHÔNG ghi attempts/XP/progress vào DB (SF-6) — in-memory only; KHÔNG wire submit service-role
- KHÔNG metadata SEO (SF-7 — để file riêng cho SF-7), KHÔNG admin (SF-5)
- KHÔNG sửa lib SF-3 — lệch contract → flag coordinator
- Merge convention (song song với SF-5): sau merge regen lockfile, không resolve tay

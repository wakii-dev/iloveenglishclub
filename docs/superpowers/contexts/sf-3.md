# SF-3 Context Pack — Dictation core lib

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-28-iloveenglishclub-design.md` — **§5 là contract, đặc biệt bảng Scoring rules §5.5 + state machine §5.4**. Bracket: `docs/superpowers/brackets/vu15-iloveenglishclub.md`.

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)

1. **Tokenize + normalize (spec §5.5):** tokenize theo khoảng trắng; chuẩn hóa apostrophe cong `’` → `'`; contraction = 1 token ("don't" là 1 token)
2. **Strict mode (mặc định):** phân biệt hoa/thường, dấu câu đính vào token tính khác ("cat." ≠ "cat")
3. **Relaxed mode:** không phân biệt hoa/thường + strip dấu câu khỏi token (đọc `relaxedMode` param — setting user là việc SF-4/SF-6)
4. **Word-diff:** so khớp thứ tự từ transcript vs input; trả danh sách trạng thái per từ (matched / wrong / missing / extra) đủ để UI render xanh/đỏ + "từ đầu tiên chưa đúng" cho hint
5. **accuracy = matched / transcript_word_count** (mẫu số là TRANSCRIPT, không phải input), scale 0–1
6. **wpm** = từ đúng / phút, tính theo **duration audio gốc** (không theo tốc độ phát) — nhận durationMs param
7. **XP** = `round(10 × accuracy × hintModifier × relaxedModifier)`; hint ×0.8, relaxed ×0.5; **chỉ attempt đầu của part** được XP — hàm nhận `isFirstAttempt` (check first-attempt trong DB là việc SF-6; lib chỉ tính thuần)
8. **split-sentences(text):** chia theo `.?!` thành mảng câu — naive đúng spec; note known-limitation (Mr., e.g., 3.5, ellipsis) là behavior chấp nhận, KHÔNG xử lý viết tắt
9. **Player store (Zustand, `lib/dictation/store.ts`)** — state machine §5.4 ĐẦY ĐỦ: idle → start-gate → playing/input → checked(có sai → check-lại không giới hạn | đúng hết → banner) → advance → … → lesson-complete (mọi part done-or-skipped); actions: start/play/pause/replay/setSpeed/seek/setInput/check/hint/skip/next/prev-part/toggle-relaxed; part states: pending/done/skipped; skip không tính done; XP accrue in-memory (persist là SF-6)
10. **Vitest 100% nhánh** cho mọi pure function theo đúng bảng scoring rules; store test không cần DOM

## Touch map (files SF-3 tạo/sở hữu)

```
src/lib/dictation/diff.ts (tokenize/normalize/diff/accuracy/wpm/xp)
src/lib/dictation/store.ts (Zustand state machine)
src/lib/content/split-sentences.ts
src/lib/dictation/*.test.ts, src/lib/content/*.test.ts
```
READ-ONLY: mọi thứ khác. Export API rõ ràng + type đầy đủ — SF-4 và SF-5 import từ đây, không tự viết lại logic.

## ACCEPTANCE (user-visible — dev-facing, pure lib)

- `vitest run` exit 0, coverage 100% nhánh các module trên
- Test case phủ đúng ví dụ spec: "cat." ≠ "cat" (strict) = "cat" (relaxed); "don’t" = "don't" = 1 token; accuracy mẫu số transcript khi input thừa/thiếu từ; XP: 10×1.0×1×1=10, hint 10×0.8=8, relaxed 10×0.5=5, attempt-lại = 0
- State machine test: check-sai → sửa → check-lại OK; skip không cộng done; hoàn thành chỉ khi mọi part done-or-skipped

## Boundary (KHÔNG làm)

- KHÔNG UI/component nào (SF-4), KHÔNG Server Action/DB (SF-6), KHÔNG audio file handling
- KHÔNG auto refresh API — export ổn định, đổi signature phải note trong commit cho SF-4/SF-5 biết
- Merge convention (song song với SF-2): sau merge regen lockfile, không resolve tay

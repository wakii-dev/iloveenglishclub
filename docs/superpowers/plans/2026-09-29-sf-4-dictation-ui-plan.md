# Plan: SF-4 Dictation UI lesson page (VU-19)
Date: 2026-09-29 | Linear: VU-19 | Worktree: sf-4-dictation-ui
Spec: `docs/superpowers/specs/2026-09-29-sf-4-dictation-ui-design.md` (spec-critic: đang chạy — sẽ ghi verdict)
Design hand-off: `docs/superpowers/designs/vu15-dictation-direction.md` (B Classroom Warm — nguồn sự thật số)

## 0. Root cause analysis (WHY)
### Root cause
Route lesson tồn tại nhưng chỉ là placeholder SF-2; engine SF-3 (diff/score/XP/store) chưa được nối vào UI nào → không ai học được bài nào. Epic không có sản phẩm demo.
### Current state (before feature)
Placeholder page: title + audio demo thô + CTA disabled. Store SF-3 singleton + hook `useDictationStore` sẵn sàng; content queries SF-2 sẵn sàng; tokens design đã map đủ trong globals.css.
### Expected outcome
Học viên (guest) mở bài demo L3-U1-L1: Start → nghe (speed/seek) → gõ → check word-diff → sửa lại vô hạn → hint/skip → điều hướng part → màn kết quả accuracy/XP + full transcript + banner "đăng nhập để lưu". User đã login: relaxed mode persist qua profile.
### Constraints & hardships
KHÔNG ghi attempts/XP DB (SF-6); KHÔNG sửa lib SF-3 (bug → flag); KHÔNG metadata SEO (SF-7); repo không remote — commit local; merge song song SF-5 → regen lockfile tại merge; messages per-namespace (SF-5 song song không conflict).
### High-level strategy
RSC page fetch → 1 client orchestrator + child components presentational; state machine 100% store SF-3; audio sync qua mediaNonce; TDD phần pure (helpers), e2e Playwright phủ flow guest; browser-verify 3 tầng Rule 0 trước khi coi xong.

## 1. Problem (intent, NOT solution)
Người học cần trải nghiệm chép chính tả hoàn chỉnh (nghe→gõ→được chấm→sửa) trên browser — hiện không có màn hình nào làm được điều đó.

## 2. Scope
- In scope: thay `listen-and-type/page.tsx`; `src/components/dictation/*` (12 component + orchestrator); `src/lib/actions/relaxed-mode.ts`; `src/lib/dictation-ui/format.ts` (+test); messages `{en,vi}/lesson.json` (thêm `dictation.*`, xóa `placeholder.*` orphan); Playwright infra (`playwright.config.ts`, devDep `@playwright/test`, `e2e/dictation-guest.spec.ts`); evidence + audit log.
- Out of scope: persist attempts/XP (SF-6), login-giữa-lesson commit (SF-6), metadata/SEO (SF-7), admin (SF-5), jsdom component tests (deviation ghi trong spec §1), sửa `lib/dictation/*` + `lib/content/*`.
- Success criteria (observable — ACCEPTANCE context pack, kiểm từng dòng ở Phase 5):
  1. Mở `/en/books/level-3/units/1/lessons/1/listen-and-type` → thấy Start → bấm → audio tự phát câu 1
  2. Gõ sai vài từ → Check → xanh/đỏ + chip từ đúng; sửa → Check lại bao nhiêu lần cũng OK
  3. Hint lộ từng từ + mark đã-hint (XP ×0.8 hiển thị); Skip nhảy qua không tính tiến độ
  4. `‹ 1/4 ›` xem lại part đã xong; không nhảy tới part chưa làm
  5. Hết bài → màn kết quả accuracy/XP; mobile attrs autocapitalize/autocorrect/spellcheck off
  6. Guest thấy banner "đăng nhập để lưu" + XP chip "chưa lưu" phân biệt; Full transcript tab mở sau khi bắt đầu
  7. `npm test` xanh (không regression SF-1/2/3) + `npm run typecheck` + `npm run lint` sạch + e2e guest happy path PASS

## 3. Touch map
- Modify: `src/app/(public)/[locale]/books/[book]/units/[unit]/lessons/[lesson]/listen-and-type/page.tsx` · `messages/en/lesson.json` · `messages/vi/lesson.json` · `package.json` (+devDep @playwright/test)
- Create: `src/components/dictation/{dictation-lesson,start-gate,dictation-player,type-panel,word-diff-display,hint-strip,lesson-actions,part-nav,progress-bar,sentence-dots,transcript-tab,results-screen,shortcuts-panel,relaxed-toggle,login-banner,xp-chip}.tsx` · `src/lib/actions/relaxed-mode.ts` · `src/lib/dictation-ui/{format.ts,format.test.ts}` · `playwright.config.ts` · `e2e/dictation-guest.spec.ts`
- Consumers/regression: SF-6 (tái dùng store + components, zero đổi contract), SF-7 (thay metadata — page để `generateMetadata` hiện trạng mỏng), unit page SF-2 (link URL không đổi)
- Shared surfaces: KHÔNG API/DB schema/env mới (env chỉ .env.local gitignored); messages namespace `dictation` (mới — không đụng namespace SF-5)

## 4. Design
- Approach chosen: **A — 1 client orchestrator + child presentational** (spec §2); audio intent-sync qua `mediaNonce` (đúng contract ghi sẵn trong store.ts), store `reset()` on unmount.
- Alternatives considered: per-part URL routing (đụng SEO routes, mâu thuẫn §5.6 in-page nav — loại); server-action-per-check persist (SF-6 — loại).
- Edge cases: part audioPath null → player disabled + note, flow gõ vẫn chạy; `play()` bị autoplay chặn → `.catch` im lặng; part RESOLVED → đóng băng read-only (textarea readOnly, actions disabled, shortcuts im); part-nav `›` thuần điều hướng (chỉ khi RESOLVED — không resolve ngầm); Enter khi checked+sai → check lại; empty input check → tiêu first attempt (theo spec SF-3 có chủ đích); headless `timeupdate` không fire → waveform fallback `durationMs` DB.
- Non-functional: a11y focus-visible 3px (global), Tab=replay theo spec §5 + hẹn audit M6, `←/→` seek chỉ khi không focus textarea; i18n 100% qua message catalog; security: server action re-check session server-side, không nhận userId từ client; perf: preload audio câu kế, ISR 300 giữ.

## 5. Implementation outline
- **Ownership mandate (plan-critic P0):** T1 dựng orchestrator `dictation-lesson.tsx` ĐẦY ĐỦ slot — pre-mount stub inert cho TẤT CẢ child components theo spec §2 (ĐÚNG tên file/props). T2–T5 CHỈ fill file component của mình + component test, KHÔNG sửa orchestrator/messages trừ khi stub không đủ (thì note commit). Messages: T1 seed trọn bộ key inventory spec §5 ngay từ đầu (100% keys) — T2–T5 chỉ consume. Context pack touch-map path STALE (thiếu route group) — path thật `src/app/(public)/[locale]/...` (theo plan §3).
- Tasks (DAG — deps →):
  - T1 `foundation`: format helpers TDD đủ 4 họ (formatTime · seek clamp · waveform fill count · XP-max/facts) + page RSC (full path `(public)`) + orchestrator ĐẦY ĐỦ slots + stub inert mọi child + StartGate + SentenceDots + messages dictation.* (en/vi) 100% inventory + xóa placeholder.* + `reset()` on unmount. Exit: lesson render Start; bấm Start → state dictation (stubs placeholder); `npm test` xanh (helpers 4 họ).
  - T2 `player-audio`: DictationPlayer (play 52px/waveform 28 bar/time/speed/seek) + audio sync nonce + preload câu kế + no-audio fallback. Exit: bấm play ra tiếng; speed cycle 5 mức (manual verify có evidence screenshot); seek ±3s + click waveform chạy; waveform fill theo elapsed.
  - T3 `input-check-diff`: TypePanel (attrs/Enter/paste) + WordDiffDisplay + banner "Chính xác!" + HintStrip + LessonActions (Skip/Check/Câu tiếp/Hint — KHÔNG RelaxedToggle). Exit: gõ sai → check → diff đúng màu + chip từ đúng; sửa → check lại OK; hint lộ từ; Enter check; paste bị chặn (browser-verify).
  - T4 `nav-transcript-shortcuts`: PartNav (‹/› thuần điều hướng) + ProgressBar + TranscriptTab (blur pending + Play all — pause main player khi phát) + ShortcutsPanel + keyboard handlers (Tab/Esc/Ctrl+Shift+/; ←/→ ngoài textarea). Exit: nav qua lại part xong; không nhảy tới part chưa làm; transcript lock đúng; shortcuts chạy.
  - T5 `results-relaxed-banner`: ResultsScreen (AccuracyRing/RewardPills/Try again — gesture chain reset+start×2; Bài tiếp theo + fallback về unit) + LoginBanner + XpChip (ephemeral "chưa lưu" — XP ×0.8 hint hiển thị qua chip) + RelaxedToggle (tabs row — chỗ duy nhất) + server action `relaxed-mode.ts`. Exit: hết bài thấy results đủ mảnh; guest banner + "chưa lưu"; **user login (seed) → toggle → refresh → state còn** + action tự lấy id từ `auth()` (không nhận userId client); relaxed guest in-memory.
  - T6 `playwright-e2e`: playwright.config.ts port 3100 + `e2e/dictation-guest.spec.ts` guest happy path (start→gõ sai→check→sửa→đúng→next×3→hint→XP chip +8 sau hint→skip không cộng→results→banner→part-nav không nhảy tới) + chromium (đã cài; @playwright/test đã có sẵn package.json). Exit: e2e PASS + `npm test`/typecheck/lint sạch + evidence `docs/superpowers/evidence/sf-4-dictation-ui/test-run.txt` (HEAD hash + tdd dòng).
- File structure: đúng touch map context pack; component PascalCase trong `src/components/dictation/`; helper thuần `src/lib/dictation-ui/` (TÁCH KHỎI `src/lib/dictation/` — sở hữu SF-3).
- Testing strategy: TDD pure helpers; mỗi task browser-verify thủ công (Rule 0) khi tổng hợp; e2e Playwright guest; verify ACCEPTANCE từng dòng Phase 5; code-reviewer độc lập trên toàn diff SF-4 trước gate.

## 6. Risks & unknowns
- Must verify: Playwright chromium download thành công trong máy này (nếu fail → báo trung thực, không fake); audio autoplay trong headless (flag `--autoplay-policy=no-user-gesture-required`); dev server port 3100 tự do.
- Unverified assumptions: `durationMs` DB (3500) khớp `audio.duration` thật (fallback an toàn đã thiết kế); JWT session đủ cho action relaxed (auth() server-side — có sẵn).

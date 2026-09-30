# Plan — SF-2 Dictation engine + player flow QA (VU-26)

Spec: `docs/superpowers/specs/2026-09-30-sf2-dictation-qa-spec.md` · Context pack: `docs/superpowers/contexts/qa-hardening/sf-2.md`
Isolation: DB `ilec_sf2` · port 3210 · config `playwright.sf2.config.ts` · fixture `sf2-…@test.ilec` · findings QA-100–199.

Chạy TUẦN TỰ (workers:1, cùng DB/port — không song song được). Tasks 2–10 exploratory phát hiện finding → ghi registry ngay → task 11 fix TDD gom. Mỗi task commit atomic riêng.

## Tasks

### Task 1 — e2e-config-db-bootstrap
- `.env.local` worktree: copy từ `~/orca/workspaces/iloveenglishclup/story-vu15-iloveenglishclub/.env.local` + sửa `DATABASE_URL` → DB `ilec_sf2` + thêm `E2E_PORT=3210` (gitignored — KHÔNG commit).
- Tạo `playwright.sf2.config.ts` theo checklist P1-5 (spec slice §5.1). KHÔNG sửa baseline configs.
- **Exit:** `npx playwright test --list --config playwright.sf2.config.ts` thấy baseline `dictation-guest` + (sau task 2) spec mới; baseline guest suite PASS trên port 3210/DB sf2 (warm-up trước).

### Task 2 — scoring-edge-ui
Spec `e2e/dictation-scoring-edges.spec.ts`: oracle = import `diffWords` trực tiếp. Cases: apostrophe `’`/`'` (don't), dấu câu đính token (cat. vs cat), hoa/thường strict vs relaxed, unicode (NFC/NFD, tiếng Việt), input trống, input quá dài (MAX_TYPED_LEN probe UI), số (3.5), token toàn dấu câu, extra tokens (anti-gaming). So UI render (word-diff chips + XP) vs truth.
- **Exit:** mọi case UI khớp truth HOẶC finding QA-1xx + repro.

### Task 3 — store-edge
Spec `e2e/dictation-store-edge.spec.ts`: reload giữa chừng (state mất — in-memory), double-submit Enter nhanh (user `sf2-learner@test.ilec` — đếm rows attempts qua `e2e/db.ts` = 1), frozen controls (review mode readOnly + disabled), Enter semantics theo (attempts, allCorrect).
- **Exit:** rows đếm đúng; findings nếu lệch.

### Task 4 — audio-controls
Spec `e2e/dictation-audio-controls.spec.ts`: speed cycle 0.5→1.5 + playbackRate thật, seek (waveform click), replay nonce (ended → icon replay → phát lại 0), audio 404 (part không audio → player disabled + note fail-soft; audioUrl hỏng → không vỡ UI), driver local vs blob (probe token vắng → ghi nhận).
- **Exit:** controls đúng spec §5.1/§3.2; findings nếu lệch.

### Task 5 — start-gate-browser
Spec `e2e/dictation-start-gate.spec.ts`: phase idle→start-gate→playing; audio.paused thật (evaluate) trước=false-play/sau-Start; REAL browser verify (Orca browser, không autoplay flag) gesture-gate desktop + mobile emulated.
- **Exit:** bằng chứng 3 tầng (DOM + screenshot + flow) — Rule 0.

### Task 6 — nav-progress-results
Spec `e2e/dictation-nav-results.spec.ts`: part-nav ‹› 1/21, progress % (skip không tính), results (accuracy ring, XP tổng, review words từ part skipped), transcript tab (locked→unlock, play-all highlight + queue).
- **Exit:** walkthrough trọn bài không vướng; findings nếu lệch.

### Task 7 — guest-flow
Baseline `dictation-guest` re-run trong config sf2 + probe thêm: banner login, XP "not saved", reload mất đúng, relaxed toggle giữa chừng → **triage BY-DESIGN** (row registry + rationale, không fix).
- **Exit:** baseline suite xanh trên sf2; BY-DESIGN rows ghi đúng.

### Task 8 — mobile-viewport
Spec `e2e/dictation-mobile.spec.ts` project iPhone 12: tap targets ≥44px (play 52px, speed, nav 38px probe), textarea mobile attrs (autocapitalize/autocorrect/spellcheck), Enter-as-submit mobile, safe-area (không che input), layout không tràn.
- **Exit:** screenshot mobile bằng chứng; IME thật → Recommendations.

### Task 9 — i18n-lesson
Spec `e2e/dictation-i18n.spec.ts`: /en vs /vi lesson thật — start-gate copy, player aria, diff notes strict/relaxed, results, banner; locale switch giữ route. (Baseline `i18n-switch` đã có —(sf2 config không nhặt; chỉ lesson surface ở đây.)
- **Exit:** en/vi parity trên UI thật; messages parity `npm test` vẫn xanh nếu chạm.

### Task 10 — a11y-keyboard
Spec `e2e/dictation-a11y.spec.ts`: shortcuts panel mở/đóng + click-outside, Tab=replay, Esc=pause, Ctrl+Shift+/=hint, ←/→=seek ±3s (không trong textarea), focus ring visible qua keyboard nav, aria-live diff, progressbar/slider aria-valuenow, aria-pressed toggles.
- **Exit:** mọi shortcut đúng; Lighthouse a11y không tụt (nếu fix UI).

### Task 11 — triage-fix-e2e-expansion
Fix TDD MỌI finding OPEN trong findings-sf2.md (RED→GREEN đúng lane: unit nếu chạm lib — giữ `npx vitest run --coverage` 100% branch `src/lib/dictation/**`; e2e nếu UI; messages CẢ en+vi + `npm test` parity). DEFERRED chỉ khi out-of-scope (schema/dep) + rationale + sign-off PM qua epic comment.
- **Exit:** registry surface SF-2 0 OPEN · matrix lane liên quan xanh · evidence `docs/superpowers/evidence/qa-hardening/` cập nhật.

## Sau task 11 (run checklist)
1. Verify ACCEPTANCE từng dòng context pack (không process-pass).
2. Rule 0 browser 3 tầng: DOM → screenshot → flow trọn (real browser).
3. Code-reviewer độc lập trên diff SF → CHANGES-REQUESTED thì fix → re-review đến APPROVED.
4. Commit + push `wakii-dev/sf-2-dictation-qa` → report DONE (KHÔNG merge).
5. `~/.claude/bin/story-verify sf-2` sạch.
6. KHÔNG set Linear Done (coordinator set sau merge).

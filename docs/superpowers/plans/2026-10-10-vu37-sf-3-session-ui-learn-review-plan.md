# VU-37 SF-3 — Session UI learn + review (VU-40) — plan

Spec slice: `docs/superpowers/contexts/vocab-memrise/sf-3.md` · Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2) · Design hand-off USER-APPROVED 09/10: `docs/superpowers/designs/vocab-memrise/vocab-memrise-direction.md` (+ `proto-A.html` nguồn pixel) · Bracket: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md` §SF-3.

Worktree `sf-3-session-ui-learn-review` · base `wakii-dev/story-vu37-vocab-memrise` (SF-1 + SF-2 đã merge) · Linear VU-40.
Boundary: KHÔNG sửa engine/API SF-2 (`learn-session*`, route session — contract thiếu → FLAG) · KHÔNG sửa hub/dashboard (SF-4) + lib SF-1 · KHÔNG đổi schema · KHÔNG tự đổi direction design · KHÔNG động quiz logic ngoài import/comment-remove · KHÔNG đụng lookup/dictation.

Contract SF-2 tiêu thụ (đọc `learn-session.ts` + route): GET `{ok, sessionKey, kind, bookId:number|null, steps:SessionStep[]}` (steps rỗng = level hết/nothing due, 200) · POST FLAT `{ok, correct, grade:StepGrade|null, xpAwarded, xpCapped, totalXp, streak, goalDone}` · POST `bookId` BẮT BUỘC positive (review scope-all GET trả null → client tự gửi 1 — coordination note trong route) · listen không-options là CONTRACT (pool <2 nghĩa, pin test 260) → client fallback **gõ nghĩa** (gradeStep listen so meaningVi).

## Phase 0 (compact — epic đã P0; context pack = impact analysis)

- **Touch map**: 6 file component mới + 1 page mới + 1 page rewrite + xoá 4 cụm legacy (ReviewFlashcards, route review + test, review-flow.spec + config 3311, hàm review-store) + 2 config e2e mới + fixture + i18n + tokens globals.css + package.json lanes.
- **Multi-dim**: functional (7 acceptance user-visible) · technical (client state machine useReducer pure tách test được; components tách file theo touch map) · data (chỉ đọc/ghi QUA API SF-2 — zero query mới vào bảng) · perf (steps ≤ ~20/phiên, bounded) · security (không tự chấm client — POST server; không render đáp án vì payload không có) · backward-compat (URL `/me/vocabulary?scope=&word=` giữ nguyên; hub-review-section CTA không đụng) · UX (keyboard toàn phiên, aria-live, focus management, reduced-motion, touch ≥44, mobile 375) · maintenance (reducer test thuần) · operational (POST lỗi → feedback mềm + retry; 401 → CTA login) · business (vòng học THẬT — mục tiêu epic).
- **Direction**: hand-off đã duyệt — tokens `:root`/`.dark` mở rộng globals.css (§1), structure/behavior §2.2/§3, dark scope container vocab (§4, localStorage `ilec.vocab-theme`), KHÔNG render stepchips prototype-only.
- **Rủi ro env**: worktree thiếu `.env.local` + `node_modules` → copy env từ main checkout + `npm ci` (đã làm đầu run). DB e2e: kiểm `vocab_activity`/`profiles.daily_goal_words` trên DATABASE_URL trước suite 3317/3318.

## Tasks

- [x] T1. Nền design: globals.css thêm token mở rộng hand-off §1 (light `:root` + dark `.dark`: leaf/leaf-deep/leaf-soft · teal-soft/teal-deep · gold/gold-bright/gold-soft/gold-soft-line · red-soft · dim/wave-dim/legend-ink · garden · color-scheme) + `@theme inline` mapping utilities; i18n `messages/{en,vi}/vocabulary.json` nhóm `session.*` (header/progress/4 step/feedback/summary/empty/error/theme) + dọn key chết flashcard CẢ 2 locale (parity giữ nguyên)
- [x] T2. Runner core TDD: `session-runner.tsx` (client) — `sessionReducer` thuần export test riêng: queue step từ GET, requeue từ-sai CUỐI HÀNG (attemptNo+1, không lặp introduce), slot done khi từ hoàn thành lượt, XP live (chip), thu kết quả summary (xpTotal/xpCapped/planted/correctSteps/stage per từ từ grade POST); POST per bước test (introduce KHÔNG POST); pending chặn double-submit; 401 → CTA login; lỗi → feedback mềm + retry; progress hạt giống 5 slot (aria tổng hợp) + focus management khi đổi step
- [x] T3. 4 step component + summary (`session-{introduce-card,mc-step,listen-step,type-step,summary}.tsx`): introduce = chip stage + từ Baloo 38 + IPA + nút nghe coral pill (audioUrl null → ẩn; pattern `resolveStoredAudioUrl`) + nghĩa VI + ví dụ bg2 + CTA; MC = radiogroup aria + options + miniaudio teal + feedback aria-live; listen = phát lại teal 58 + waveform + options (không options → input gõ nghĩa fallback); type = prompt nghĩa VI Baloo 26 + input (autocapitalize=off spellcheck=false) + Enter submit + 3 trạng thái đúng/gần-đúng/sai; summary = XP Baloo 52 + breakdown theo kind + 3 ô stats + capnote khi xpCapped + CTA next level/dashboard
- [x] T4. Pages: `vocabulary/learn/[book]/page.tsx` (mới — force-dynamic, auth redirect `?next`, bookId số → khôngValid notFound, book không tồn tại notFound, steps rỗng → sách hoàn thành; header meta book + level/range từ query page-level min-unplanted→chunk); `[locale]/me/vocabulary/page.tsx` rewrite (giữ URL contract `?scope=book&book=` + `?word=`; wordNotFound → fallback phiên thường; steps rỗng → reviewEmpty) — cả 2 render SessionRunner + dark toggle scope container
- [x] T5. Nghỉ hưu legacy: XOÁ `review-flashcards.tsx`, `api/vocabulary/review/route.ts` + `route.test.ts`, `playwright.vocabulary-review.config.ts`, `e2e/review-flow.spec.ts`; `review-store.ts` xoá `applyReview`/`listDueWords` (+ test khớp — hết consumer thì xoá file); `quiz-runner.tsx` bỏ vết comment ReviewFlashcards; package.json `-test:e2e:vocabulary-review` + `+test:e2e:vocabulary-learn-session` (3317) + `+test:e2e:vocabulary-review-upgrade` (3318) — exit: `grep review-flashcards` = 0, tsc + build xanh, quiz 3312 vẫn xanh
- [x] T6. e2e 3317 learn-session: config mới (pattern 3315 — seed trước server bind) + fixture `qa-ls-*` (book riêng 12 từ ĐỦ audio + nghĩa phân biệt) + spec: walkthrough 5 từ UI thật chuột+bàn phím (introduce→MC→listen→type, keyboard trọn 1 chuỗi từ), sai 1 bước requeue thấy rõ + đúng lần sau vẫn tính, reload giữa phiên queue còn lại, tổng kết XP đúng (+N XP = 4×planted + bước đúng, capped khi cap), a11y đi phiên bằng keyboard
- [x] T7. e2e 3318 review-upgrade: config mới + fixture `qa-ru-*` (seed due pattern `seedDueProgress`) + spec: gõ đúng → +1 XP + due_at tiến; gõ sai → requeue trong phiên + lapses+1 + 0 XP; double-submit (delay network hoặc re-click) không cộng XP; `?word=` prefill đúng 1 từ; `?scope=book&book=` lọc
- [x] T8. Verify kỹ thuật: vitest full exit 0 + `tsc --noEmit` + eslint changed + `next build` + quiz 3312 xanh + grep=0 — evidence `docs/superpowers/evidence/sf-3-session-ui-learn-review/test-run.txt` (dòng đầu `tdd:` + hash)
- [x] T9. Rule 0 BROWSER VERIFY 3 tầng: DOM (eval hỗ trợ) · VISUAL (screenshot learn/review/dark/mobile-375 so proto-A hand-off) · FLOW (login→learn trọn phiên→review→logout) — screenshot lưu evidence; fail → nói thật + fix trước review
- [x] T10. code-reviewer ĐỘC LẬP trên diff SF (rolling: nhóm UI core khi T5 xong, nhóm e2e khi T7 xong) — CHANGES-REQUESTED → fix → re-review; APPROVED → comment VU-40 kèm literal CHECKLIST-4Q
- [ ] T11. story-verify `sf-3-session-ui-learn-review` sạch (B3 false-FAIL do Linear 429 khi APPROVED đã post → note evidence + dừng) + push `wakii-dev/sf-3-session-ui-learn-review` + report DONE — KHÔNG merge, KHÔNG set Done

## Rolling review (CHECK 3)

1. Nhóm A (T1–T5): code-reviewer trên diff UI core + retirement ngay khi T5 xong
2. Nhóm B (T6–T8): code-reviewer trên diff e2e + evidence
3. Nhóm C (T9–T11): verdict cuối `VERDICT: APPROVED` + literal `CHECKLIST-4Q` post VU-40 (B3 gate)

## ACCEPTANCE (context pack — verifier Phase 5 kiểm TỪNG dòng)

1. Đăng nhập, mở learn page sách: card giới thiệu (audio khi có, IPA + nghĩa + ví dụ), MC + nghe + gõ BẰNG BÀN PHÍM toàn bộ
2. Sai 1 bước → từ quay lại cuối hàng phiên (thấy rõ), đúng lần sau vẫn tính
3. Hết phiên → tổng kết: XP (capped flag nếu có), số từ planted, stage; next level → phiên mới
4. F5 giữa phiên → queue còn lại (không làm lại từ đã planted)
5. `/me/vocabulary`: review mới (MC/nghe + gõ); đúng → +1 XP + due lần sau; sai → thẻ quay lại; prefill `?word=` đúng 1 từ
6. Không còn vết `review-flashcards`; quiz 3312 xanh; 3311 retired (lane mất)
7. Mobile 375 trọn phiên không vỡ; `prefers-reduced-motion` tắt animation

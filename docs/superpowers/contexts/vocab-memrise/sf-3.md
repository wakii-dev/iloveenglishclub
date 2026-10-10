# SF-3 Context Pack — Session UI learn + review (tier 2, depends SF-2 · DESIGN: mock-prototype)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2). Bracket plan: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md`. Story: VU-37, dest `story-vu37-vocab-memrise`, Phase 1/2.
> **DESIGN GATE:** SF có `design: mock-prototype` — implement theo hand-off `docs/superpowers/designs/vocab-memrise-direction.md` (tokens/structure/behavior do designer phase duyệt). Nếu hand-off chưa có → DỪNG, báo coordinator (không tự chế hướng).

## Spec slice (SF-3 chịu trách nhiệm)

1. `SessionRunner` (client): render theo step list từ GET `/api/vocabulary/session` (SF-2 contract §5 spec — đọc lại response shape trong context pack SF-2); state machine client-side: đi step theo `stepIndex`, requeue sau đáp án sai là trạng thái CLIENT (từ sai quay lại cuối hàng phiên, attemptNo tăng); reload trang = GET lại (server-derived queue còn lại). Progress bar per phiên.
2. `IntroduceCard`: từ + audio player (tái dùng pattern `WordPlayButton`/`resolveStoredAudioUrl` — `audioUrl` null → ẩn nút) + IPA + nghĩa VI + ví dụ + growth chip (lib `growth.ts` SF-1 — key i18n `learn.stage.N` từ SF-1 skeleton).
3. `McStep`: options từ `step.options`; chọn → feedback đúng/sai (từ server POST response, KHÔNG có cờ đáp án ở payload); keyboard operable (radio-group pattern).
4. `ListenStep`: audio replay control (nút phát lại, không autoplay lặp); step này chỉ tồn tại khi từ có audio (server đã lọc).
5. `TypeStep`: input text + prompt = nghĩa VI (`meaningVi` CÓ trong payload — là prompt chính đáng); submit → server chấm; typo được chấp nhận (≤1, từ ≥5 ký tự) hiển thị feedback "gần đúng" như đúng.
6. Per-word grade: sau các bước test của từ, gọi POSTgrade một lần (`attemptNo` per lượt); chờ response → cập nhật SRS chip + progress; từ sai → client requeue.
7. `SessionSummary`: XP nhận (kể cả `xpCapped` flag), số từ planted, stage đạt được, CTA next level / về dashboard.
8. Page `/[locale]/vocabulary/learn/[book]`: force-dynamic, auth `redirect('/{locale}/login?next=…')` pattern như `/me/vocabulary`; load GET session; book không tồn tại → notFound.
9. `/[locale]/me/vocabulary` rewrite → render review runner (GET `?kind=review` với `?word=` prefill + `?scope=book&book=`): giữ URL contract. **Nghỉ hưu legacy surface (exit criteria pinned):** xoá `ReviewFlashcards`; refactor `quiz-runner.tsx` (đang import review-flashcards — `grep review-flashcards` = 0); xoá route `POST /api/vocabulary/review` + `applyReview` + `listDueWords` (path client-trusted quality KHÔNG được sống sót — quyết định: DELETE); xoá `playwright.vocabulary-review.config.ts` + `review-flow.spec.ts` + lane `test:e2e:vocabulary-review` (3311 retired); giữ contract `href="/me/vocabulary?scope=all"` (hub-review-section CTA) + prefill; `tsc` + next build xanh; suite quiz 3312 vẫn xanh.
10. e2e learn port **3317** (config mới `playwright.vocabulary-learn-session.config.ts`, fixture `qa-*` pattern `vocabulary-learn-fixture.ts`, workers:1, globalSetup idempotent + teardown): walkthrough learn 5 từ bằng UI thật (chuột + bàn phím), reload giữa phiên không mất, tổng kết XP hiện đúng.
11. e2e review port **3318** (config mới; migrate coverage từ suite 3311 cũ): seed due rows (pattern `seedDueProgress`), gõ đúng → +1 XP do_at tiến; gõ sai → requeue trong phiên + `lapses+1` + 0 XP; double-submit cùng bước (chặn network hoặc re-click) không cộng XP; `?word=` prefill chạy.
12. i18n keys session UI (`messages/{en,vi}/vocabulary.json` hoặc `learn.json` — đặt chỗ hợp lý, parity test); a11y: keyboard đi được TOÀN BỘ phiên (tab order, focus management khi chuyển step, aria-live cho feedback), `prefers-reduced-motion` (bỏ/tắt animation chuyển card), touch target ≥44px, mobile 375 usable; npm lane mới cho 2 suite.
13. Merge về đích + `~/.claude/bin/story-verify` sạch + audit comment.

## Touch map (SF-3 sở hữu)

```
src/components/vocabulary/session-runner.tsx        (mới)
src/components/vocabulary/session-{introduce-card,mc-step,listen-step,type-step,summary}.tsx (mới — tách file theo component)
src/app/(public)/[locale]/vocabulary/learn/[book]/page.tsx (mới)
src/app/(public)/[locale]/me/vocabulary/page.tsx    (sửa — rewrite render)
src/components/vocabulary/review-flashcards.tsx     (XOÁ)
src/app/api/vocabulary/review/route.ts + route.test.ts (XOÁ)
src/lib/vocabulary/review-store.ts                  (sửa — xoá applyReview/listDueWords nếu không còn consumer; giữ pure srs.ts)
src/components/vocabulary/quiz-runner.tsx           (sửa — bỏ import review-flashcards)
playwright.vocabulary-review.config.ts + e2e/review-flow.spec.ts (XOÁ)
playwright.vocabulary-learn-session.config.ts + e2e/learn-session.spec.ts + fixture/global-setup/teardown (mới, port 3317)
playwright.vocabulary-review-upgrade.config.ts + e2e/review-upgrade.spec.ts + fixture (mới, port 3318)
package.json (lanes +, lane - test:e2e:vocabulary-review)
messages/{en,vi}/… (keys session UI)
```
READ-ONLY: `learn-session-store` contract (SF-2), `vocab-xp*`/`levels`/`growth` (SF-1 — import thôi), hub page + `hub-overview-section` (SF-4 đang sở hữu — KHÔNG sửa), `quiz.ts`/`quiz-runner` logic quiz khác phần import-remove.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Đăng nhập, mở learn page của 1 sách: thấy card giới thiệu từ mới (audio phát được khi có, IPA + nghĩa + ví dụ), trả lời MC + nghe + gõ BẰNG BÀN PHÍM được toàn bộ, không cần chuột.
2. Sai 1 bước → từ quay lại cuối hàng trong phiên (thấy rõ), lần sau trả lời đúng vẫn tính.
3. Hết phiên → màn tổng kết: XP nhận (flag capped nếu có), số từ planted, stage; bấm next level → phiên mới.
4. F5 giữa phiên → quay lại thấy queue còn lại (không làm lại từ đã planted).
5. `/me/vocabulary`: từ due hiện dưới dạng review mới (MC/nghe + gõ từ); gõ đúng → +1 XP + thẻ báo due lần sau; gõ sai → thẻ quay lại; prefill `?word=` nhảy đúng 1 từ đó.
6. Không còn vết `review-flashcards` trong code; quiz 3312 vẫn xanh; 3311 retired (lane biến mất).
7. Mobile 375: đi trọn 1 phiên không vỡ layout; `prefers-reduced-motion` tắt animation.

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG sửa engine/API SF-2 (thấy contract thiếu → FLAG coordinator, không tự thêm field).
- KHÔNG sửa hub/dashboard (SF-4 sở hữu overview + page vocabulary), KHÔNG đụng lib SF-1.
- KHÔNG đổi schema; KHÔNG seed prod; KHÔNG tự đổi direction design (hand-off là source of truth; vấn đề → flag).
- KHÔNG động quiz logic ngoài import-remove; KHÔNG đụng lookup/dictation.

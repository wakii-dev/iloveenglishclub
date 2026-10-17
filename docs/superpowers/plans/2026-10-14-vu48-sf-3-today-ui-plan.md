# Plan — VU-48 SF-3: Trang /today UI + nav + reminder + i18n + e2e (VU-51)

Ngày: 2026-10-14 · Spec: context pack `docs/superpowers/contexts/daily-journey/sf-3.md` (spec slice + ACCEPTANCE + boundary — epic spec v2 §2.1/§2.6) · Design: direction A dashboard-dense ĐÃ DUYỆT — hand-off `docs/superpowers/designs/daily-journey-direction.md` · Base: story-vu48-daily-journey @ 2a387e2 (SF-1+SF-2 merged) · E2e port 3321.

Spec-slice đã qua epic brainstorm + spec-critic v2 + design gate (user chọn A) → plan này là decompose thực thi; KHÔNG re-litigate direction.

## Tasks

### Task 1 — i18n `today.json` (en/vi) + `common.nav.today`
- `messages/{en,vi}/today.json` MỚI: page (title/h1/desc), hero (2 ring label + aria tỉ số, trạng thái hoàn thành cả 2, chú thích phút-ước-tính), goal editors (label phút/từ, preset aria, lỗi lưu), suggestion cards (dictation next: title + progress "x/y phần" + CTA + trạng thái hoàn thành-all; vocab due: N từ + CTA; vocab continue: level kế + CTA + hết-sách), quest list (heading, done label, progress aria), badge strip (heading, đã-nhận/locked-next), streak card (ngày liên tiếp, shield credits "x/2", mô tả cơ chế trung tính — KHÔNG "được bảo vệ"), toasts (quest mới hoàn thành, badge mới).
- Keys quest/badge theo convention pin: `quests.<questId>.{title,desc}` (7) + `badges.<badgeId>.{title,desc}` (15 — pool THẬT 15, prose 13 là miscount).
- `messages/{en,vi}/common.json` + `nav.today`.
- Exit: `node node_modules/vitest/vitest.mjs run src/messages.test.ts` xanh.

### Task 2 — Reminder: readMyStats +goalDone + TodayNavDot + nav links + dispatch
- `src/lib/actions/my-stats.ts`: shape `{xp, streak, goalDone}` — goalDone = minutes-done AND words-done, VN-day: daily_activity.listen_ms hôm nay vs daily_goal_minutes + COUNT(DISTINCT word_id) practiced hôm nay vs daily_goal_words (semantics §3.5 — mirror today-store SQL, 2 query nhỏ). Guest → null (không đổi).
- `src/components/today/today-nav-dot.tsx` (client island): `useSession` + `readMyStats()` + listener `ilec:stats-updated` (pattern UserMenu); dot khi authenticated AND goalDone=false; guest không dot.
- `header.tsx`: link "Hôm nay" desktop nav (`t("nav.today")`) chứa TodayNavDot.
- `user-menu.tsx`: DropdownMenuItem "Hôm nay" (mobile — nav desktop ẩn <md) kèm dot.
- `session-runner.tsx`: `notifyStatsUpdated()` sau POST grade thành công (cạnh dispatch graded) — dot + UserMenu sống sau hoạt động vocab.
- Exit: vitest RED→GREEN `my-stats.test.ts` (goalDone: 0/0 → false; đạt 1/2 → false; đạt cả 2 → true; practiced SQL mirror §3.5; guest null).

### Task 3 — Page + components `/today`
- `src/app/(public)/[locale]/today/page.tsx`: RSC `force-dynamic`, `setRequestLocale` đầu tiên, auth-gate `redirect(/${locale}/login?next=/${locale}/today)` (pattern me/page.tsx:27-33), `generateMetadata` (namespace today), MỘT `h1`, gọi `getTodaySnapshot(userId, new Date())` — KHÔNG query trực tiếp (trừ duration-hint helper — REQUIREMENT-GAP VU-48).
- `src/lib/today/duration-hint.ts`: `hasMissingDuration(suggestion)` → true khi suggested lesson có ≥1 part NULL duration_ms (read-only, fallback-safe, try/catch → false).
- Components `src/components/today/`:
  - `today-hero.tsx` (server): 2 ring pattern `dashboard-goal-ring` (donut, role="img", aria tỉ số, stroke-dasharray, motion-safe transition) + celebration "hoàn thành cả 2" tĩnh + duration hint khi applicable.
  - `goal-editors.tsx` (client): preset phút 5/15/30 + từ 5/10/20 + free input (phút 5..120, từ 1..100); phút → PATCH `/api/today/goal`, từ → PATCH `/api/vocabulary/goal` (body {goal}); xong `router.refresh()` (pattern dashboard-goal-ring: timeout 10s, error state, Escape/blur đóng).
  - `today-suggestions.tsx` (server): 3 card theo thứ tự remaining goal — dictation next (deep-link `/books/{slug}/units/{unit}/lessons/{n}/listen-and-type` + doneParts/totalParts; null/hoàn thành-all → trạng thái), vocab due (CTA `/me/vocabulary?scope=all`), vocab continue (CTA `/vocabulary/learn/{bookId}`; null → hoàn thành sách).
  - `today-quests.tsx` (server): đúng 3 quest, progress bar, done auto (KHÔNG claim), aria.
  - `today-toast-bridge.tsx` (client): `newlyCompletedQuests`/`newlyEarnedBadges` → sonner toast đúng 1 lần (useEffect mount; ledger RETURNING đảm bảo không lặp); mount `<Toaster>` scoped page.
  - `today-badges.tsx` (server): owned + locked-next-per-metric (BADGE_POOL import thuần — không crypto).
  - `today-streak.tsx` (server): streak LIVE + shield credits/cap read-only + mô tả credit trung tính.
- A11y/mobile: tab order, focus-visible, touch ≥44px, 375px stack dọc; grid 2 cột desktop (hero+suggestions trái, quests+badges+streak phải — hand-off A).
- Exit: `npx next build` sạch + `npx tsc --noEmit` + oxlint.

### Task 4 — E2e 3321 + fixture quest-hash runtime search
- `playwright.today.config.ts`: pattern vocabulary-dashboard (E2E_PORT 3321, workers:1, testMatch anchor `(^|\/)today-.*\.spec\.ts$` — né config khác), webServer `next dev --port 3321`.
- `e2e/today-fixture.ts`: bcrypt hash tĩnh "password123"; seed user SQL (id UUID tự sinh — users.id không DB default) `qa-today-*`; **quest-hash RUNTIME SEARCH**: tạo N user, loop `selectQuests(id, vnToday())` tới set chứa `q-review-5` → seed user ĐÓ (goals 5/5, listen_ms hôm nay = 5p, practiced=3, 2 từ due để ôn đúng → goal kép, 4 quest_completions cũ → badge quests-5 sau quest thứ 5).
- `e2e/today-global-setup.ts` + teardown (cleanup qa-today-%).
- `e2e/today-page.spec.ts`: guest redirect giữ next; login seeded → hero rings đúng seeded (2/5 phút, 3/5 từ), 3 suggestion card đúng (dictation deep-link href, due count, continue level), vi/en i18n, a11y smoke (h1 1, ring role=img aria, dot ON), guest nav không dot.
- `e2e/today-quest.spec.ts`: ôn 2 từ due đúng qua UI review → PATCH-free flow: quest q-review-5? KHÔNG — practiced 3→5 đạt goal từ → dot TẮT ngay qua event (không reload); quest auto-done + toast 1 lần; reload → không toast lại, không record lại; badge quests-5 đúng 1 lần.
- Exit: `npm run test:e2e:today` xanh ×2 liên tiếp.

### Task 5 — Verify (Rule 0) + regression + review + push
- Browser 3 tầng: DOM eval (kích thước/aria/giá trị) + VISUAL screenshots BEFORE/AFTER (desktop 1280 + mobile 375, vi+en) so hand-off + FLOW login→/today→click suggestion→deep-link đúng→quay lại goal tiến→dot→logout.
- Regression: `test:e2e:vocabulary-dashboard` (3319) + `test:e2e:vocabulary` + vitest full.
- Code-reviewer ĐỘC LẬP trên diff SF → CHANGES-REQUESTED → fix → re-review APPROVED.
- Evidence `docs/superpowers/evidence/sf-3-daily-journey/` (slug bracket) + commit + `git push -u origin story-vu48-daily-journey-sf-3` → story-verify sf-3 → report DONE (KHÔNG merge, KHÔNG set Done).

## Boundary (từ context pack — KHÔNG làm)
Không sửa store/API SF-2 · không consume shield display "được bảo vệ" · không đụng /me pages · không submit-attempt/vocab-xp-store/streak wiring · không nguồn XP mới/claim button/banner reminder ngoài dot.

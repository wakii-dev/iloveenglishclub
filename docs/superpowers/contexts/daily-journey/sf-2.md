# SF-2 Context Pack — Today engine server: snapshot + resolvers + unify counter + goal API
> Đọc file này THAY VÌ tự tổng hợp từ story .wakii + epic + comments. Epic spec: `docs/superpowers/specs/2026-10-13-daily-journey-design.md` (v2). Story .wakii: `docs/superpowers/mindmaps/daily-journey.wakii`. SF-1 đã merge: migration (bảng/cột mới), `streak.ts` frozen param, `today-engine/quests/badges/shield-planner` pure libs, `listen_ms` write-path.

## Spec slice (chỉ phần SF-2 chịu trách nhiệm)
1. **`getTodaySnapshot(userId, now): Promise<TodaySnapshot>`** — `src/lib/today/today-store.ts`, shape ĐÚNG spec §3.2 (date, listenMinutesToday, dailyGoalMinutes, practicedToday, plantedToday, dailyGoalWords, partsToday, dueToday, reviewedToday, streak LIVE, activeToday, goalDone{minutes,words,both}, dictationNext, vocabContinue, quests[3], newlyCompletedQuests, newlyEarnedBadges, badges, shield{credits,cap,freezes}).
   - Thực thi pinned: (a) fan-out `Promise.all` các read nhánh độc lập (pattern `hub-overview-section.tsx:75-81`), **fallback-safe từng nhánh** (pattern `dashboard-store` — một nhánh fail trả null/0, không đổ snapshot); (b) SAU fan-out MỘT tx ghi nhỏ `await` TRONG snapshot: monthly grant + quest auto-record + badge award — mỗi bước `INSERT ... ON CONFLICT DO NOTHING RETURNING`:
     - **Monthly grant**: `INSERT shield_grants (user_id, month) ON CONFLICT DO NOTHING RETURNING` — CHỈ khi RETURNING có row → `UPDATE profiles SET shield_credits = least(shield_credits + 1, 2)` (cùng tx — chống double-credit 2 tab).
     - **Quest auto-record**: với 3 quest hôm nay (SF-1 `selectQuests`) predicate đúng + chưa có row → INSERT RETURNING → `newlyCompletedQuests`.
     - **Badge award**: `evalBadges` (SF-1) trên aggregates → INSERT `user_badges` RETURNING → `newlyEarnedBadges`.
     - Tx fail → snapshot VẪN TRẢ (đã có read), log error, không throw.
   - **Aggregates mới** (VN-day qua `(created_at at time zone 'Asia/Ho_Chi_Minh')::date`, index `vocab_activity_user_id_created_at_idx`): `practicedToday` = COUNT(DISTINCT word_id) correct AND kind IN ('learn-complete','session-step') hôm nay; `plantedToday` = COUNT kind='learn-complete' hôm nay (giữ); `reviewedToday` = COUNT(DISTINCT word_id) correct 'session-step' hôm nay TRỪ từ có 'learn-complete' hôm nay.
   - **Streak LIVE freeze-aware**: `computeStreak(dates, today, freezeSet)` trên daily_activity lookback + `streak_freezes` dates (SF-2 CHỈ ĐỌC freeze — KHÔNG consume; consume là SF-4).
   - **Badge aggregates**: `words-learned-*` = COUNT `user_word_progress` reps≥1; `active-days-*` = COUNT daily_activity rows; `listen-60/600` = getMyStats listenMinutes (all-time, KHÔNG phải tổng listen_ms); `quests-*` = COUNT quest_completions; `streak-*` = profiles.streak_count.
2. **`getNextDictationTarget(userId)`** (spec §3.4): bài published ĐẦU TIÊN theo `books.sort_order → units.sort_order → lessons.number` CHƯA done (not mọi part có attempt accuracy≥1), ưu tiên sách đang đọc (`user_lesson_progress` — pattern `getContinueTarget` `dashboard-store.ts:371-404`); fallback bài đầu hệ. Trả `{bookSlug, unitNumber, lessonNumber, title, doneParts, totalParts}`. SQL-side top-first + per-lesson check — KHÔNG load-all parts.
3. **Reuse KHÔNG viết lại**: `getHubStats().dueToday` (hub-store), `getContinueTarget` (type `ContinueCard` `dashboard-store.ts:335`).
4. **Unify counter rename (spec §3.5 — ĐỦ ripple CÙNG SF, không alias)**:
   - `dashboard-store.ts`: `DashboardSummary.plantedToday` → `practicedToday` (query mới §trên; hunks ~46/63/103 — KHÔNG đụng dòng ~106 streak wiring, đó là SF-4).
   - `learn-session-store.ts`: `countLearnCompleteToday` → `countPracticedToday` ở CẢ HAI call sites goalDone (~387-390 và ~603-606 — KỂ CẢ duplicate-reconstruct path).
   - `dashboard-stats-row.tsx` prop `planted` → `practiced`; `hub-overview-section.tsx:76` theo.
   - `messages/{en,vi}/vocabulary.json`: `goalCardLabel`/`goalRingAria` "từ mới hôm nay" → "từ ôn/luyện hôm nay" (vi + en parity).
   - **Ripple tests cùng SF**: `hub-overview-section.test.ts` + `dashboard-store.test.ts` rename expectations; e2e `dashboard.spec.ts` aria pin (~89-92, chuỗi chứa "từ mới") + `vocabulary-dashboard-fixture.ts` comment/label (SỐ không đổi — fixture chỉ seed learn-complete rows, nằm trong practiced kind IN).
5. **`PATCH|POST /api/today/goal`** — `src/app/api/today/goal/route.ts` mirror `/api/vocabulary/goal` (route.ts đọc trước): body `{minutes: int 5..120}` → `{ok, dailyGoalMinutes}`; taxonomy 401 `not-authenticated` · 400 `invalidJson|invalidMinutes` · 500 generic. Auth `auth()`, scope `session.user.id`.
6. Store tests mock `@/db` THEO pattern `src/lib/vocabulary/vocab-xp-store.test.ts:17-58` (canonical sống — KHÔNG dùng review-store.test.ts đã retired). Route test pin taxonomy.

## Touch map (files SF-2 tạo/sở hữu)
```
src/lib/today/today-store.ts + .test.ts          CREATE
src/app/api/today/goal/route.ts + test           CREATE
src/lib/vocabulary/dashboard-store.ts            MODIFY (rename hunks; KHÔNG dòng ~106 streak)
src/lib/vocabulary/learn-session-store.ts        MODIFY (2 call sites goalDone)
src/components/vocabulary/dashboard-stats-row.tsx MODIFY (prop rename)
src/components/vocabulary/hub-overview-section.tsx MODIFY (field rename)
messages/{en,vi}/vocabulary.json                 MODIFY (goalCardLabel/goalRingAria)
e2e/dashboard.spec.ts                            MODIFY (aria pin label mới)
e2e/vocabulary-dashboard-fixture.ts              MODIFY (label/comment nếu refs)
src/lib/vocabulary/hub-overview-section.test.ts / dashboard-store.test.ts  MODIFY (rename expectations)
```
READ-ONLY: `submit-attempt.ts` (cả 2 hunks), `vocab-xp-store.ts` (SF-4), `streak.ts` (SF-1 đã xong), pure libs SF-1 (dùng import — sửa = flag), mọi page/UI (SF-3), e2e port mới (SF-3), `/me` (SF-4).

## ACCEPTANCE (user-visible / nghiệm thu)
- Script/RSC demo trên dữ liệu seeded: snapshot trả ĐÚNG số liệu tay (minutes practiced/reviewed/planted/due/streak) — số liệu so tay QA.
- `/vocabulary` dashboard ring: label "từ ôn/luyện hôm nay" (vi+en), SỐ giữ nguyên so với trước rename (cùng fixture); POST session `goalDone` vẫn đúng theo practiced semantics; e2e 3319 (dashboard suite) XANH sau ripple.
- Quest auto-record: predicate đạt → row tạo ĐÚNG 1 lần (reload/rerender không lặp — ON CONFLICT); badge `quests-5` award đúng 1 lần khi đủ 5 (integration seed).
- Monthly grant: 2 render đồng thời → credits tăng tối đa +1 (RETURNING-gated test); đã đầy 2 → không tăng.
- PATCH goal minutes 15 → ring đổi, reload giữ; guest → 401 JSON taxonomy đúng.

## Boundary (KHÔNG làm)
- KHÔNG UI `/today` (SF-3) — SF-2 chỉ store+API; KHÔNG thêm keys `today.json`.
- KHÔNG consume freeze / `recomputeStreakTx` / rewire write-paths (SF-4).
- KHÔNG đụng `vocab-xp-store.ts`, `submit-attempt.ts`, `queries.ts` (getMyStats giữ nguyên), `daily-plan*.ts` (dead).
- KHÔNG tạo playwright config/port mới, KHÔNG fixture qa-today (SF-3).
- KHÔNG đổi XP rules / SRS / leaderboard view / route `/api/vocabulary/goal` contract.

# Hành trình học mỗi ngày — epic spec v2 (Daily Journey)

Ngày: 2026-10-13 · Story: (epic ID ghi khi create — đích `story-<epic>-daily-journey`) · Base: master @ f1e1f76 (đã gồm vocabulary-module + hub + learn-flow + oxford-crawl + VU-37 memrise + VU-43 CMS phase-1)
v2: áp spec-critic 2026-10-13 — streak source/acceptance thật (computeStreak semantics), caller list đúng, xóa dueNew/dueReview + lessonsCompletedToday (drop q-lesson-1), pin idempotency tx (RETURNING-gated), dot refresh dispatch vocab, pin backfill rule + coalesce, quest hash rule, drop alias + drop queries.ts dead-field, seed-gap wording, type ContinueCard, vocabulary.json trong touch map.
Phased release: **Phase 1 = SF-1..SF-3** (checkpoint sau tier 2) · **Phase 2 = SF-4** (final).

## 0. IDEA-BRIEF (8 chiều)

- **Task** — "Hành trình học mỗi ngày" = xây **engine mục tiêu hằng ngày server-side** (goal kép: X phút nghe dictation + Y từ ôn/luyện vocab), **trang `/[locale]/today`** ("Hôm nay học gì" — gợi ý bài kế tiếp từ dictation + vocab SRS queue), **quest ngắn + badge**, **streak shield** (cổ giữ streak), **nhắc học tối giản** (in-app).
- **Output** — page `/[locale]/today` (RSC, auth-gated) + goal engine server-side (pure ⋈ store theo convention) + quest/badge (auto-record) + shield (auto-consume) + reminder nav-dot; mọi hoạt động ĂN KHỚP với `/me`, streak, XP sẵn có — không nhân bản dashboard `/vocabulary`.
- **Users** — học viên tiếng Anh Việt Nam (Cambridge Prepare / IELTS), free, mobile web 375px chính, đăng nhập Google/Credentials.
- **Constraints** — MUST: TUẦN TỤ VN-day `vnToday()`/`ILEC_TZ`; XP rules VU-37 nguyên vẹn (không thêm nguồn XP); `computeStreak` với freeze-set rỗng ≡ hành vi cũ (identity test) — streak người dùng hiện có KHÔNG đổi; mọi query scope `user_id`; i18n vi/en parity (`src/messages.test.ts`); e2e suites hiện có xanh. MUST-NOT: không email/push/cron (repo không có infra — reminder in-app only); không đụng leaderboard view; không clone card dashboard vocab; không claim-button (quest auto-record); không admin CRUD cho quest/badge.
- **Input** — mô tả user (như Task); code nền dictation + vocab + gamification; không Figma (→ SF-3 design-first 3 hướng mock-prototype).
- **Context** — VU-37 memrise loop + goal ring `daily_goal_words` + dashboard vừa live; VU-43 CMS phase-1 đã merge; VU-32 crawl chạy nền (`words` read-only). `daily-plan.ts`/`daily-plan-store.ts` là dead code — KHÔNG revive, KHÔNG đụng (kể cả caller-list wiring), ghi chú future.
- **Success criteria** (binary, nghiệm thu theo SF acceptance): (1) học viên đăng nhập `/vi/today` thấy goal kép đúng số liệu thật (phút nghe hôm nay + từ ôn/luyện hôm nay), gợi ý bài dictation kế tiếp + due vocab, bấm vào học tiếp đúng chỗ; (2) hoạt động thật (nghe part / ôn từ / học từ) làm goal tiến — đạt goal kép → trạng thái hoàn thành; (3) quest hoàn thành tự ghi nhận (reload không lặp), badge milestone tự nhận (không nhận 2 lần); (4) lỡ 1 ngày có shield credit → streak còn nguyên khi học lại (credit tự tiêu); hết credit → streak reset về 1 khi học lại hôm nay (semantics `computeStreak` thật — hôm nay luôn tính); (5) nav "Hôm nay" có dot khi goal chưa xong, tắt khi đạt — cập nhật ngay sau hoạt động dictation HOẶC vocab; (6) toàn bộ e2e suite repo (`test:e2e:*` package.json) + suite mới 3321 xanh.
- **Out-of-scope** — quest XP (extension path §8); email/push/web-push/cron; shop/kinh tế gem; manual shield equip UI; admin CRUD quest/badge; đổi SRS/SM-2; đổi heatmap `/me` semantics; home redirect → /today; social/leaderboard mới; revive `daily-plan.ts`.

## 1. P0 impact — tóm tắt (full: dispatch phase0-impact-analyst 2026-10-13, 10 chiều)

**Touch map chính** — modify: `schema.ts` (additive-only: +3 cột, +4 bảng), `streak.ts` (+optional `frozen` param), `submit-attempt.ts` (listen_ms `coalesce` trong upsert sẵn có; SF-4 thay inline-recompute bằng `recomputeStreakTx`), `vocab-xp-store.ts` (SF-4 same replacement), `dashboard-store.ts` (unify counter §3.5 + streak live đọc freeze-set), `learn-session-store.ts` (2 call sites goalDone §3.5), `components/vocabulary/session-runner.tsx` (+dispatch `ilec:stats-updated` sau POST), `header.tsx` + `user-menu.tsx` + `my-stats.ts` (nav + dot, `readMyStats` +`goalDone`), `messages/{en,vi}/{common,today,vocabulary}.json` (`vocabulary.json`: `goalCardLabel`/`goalRingAria` đổi nghĩa — ring label "từ ôn/luyện"); create: `src/lib/today/*` (engine + store + quests + badges), `src/lib/gamification/streak-store.ts`, `src/app/api/today/goal/route.ts`, `src/app/(public)/[locale]/today/page.tsx`, `src/components/today/*`, e2e port **3321**. KHÔNG đụng `queries.ts` (getMyStats giữ nguyên — /me dùng listenMinutes all-time sẵn có).

**Quyết định kiến trúc (chốt từ P0 alternatives + PM ruling + spec-critic; BIG-FLAG §8):**
| Chọn | Lý do |
|---|---|
| (a) MATERIALIZE `daily_activity.listen_ms` (viết trong upsert tx sẵn có + backfill 1 lần) | đọc O(1) PK; derive-mode thiếu index `(user_id, created_at)` trên bảng `attempts` nóng — quét history mỗi render |
| (b) Quest: static defs + progress DERIVED từ snapshot + ledger `quest_completions` auto-record (KHÔNG claim, KHÔNG reward per-quest) | hết attack surface claim-farm; không coupling write-path; badge tiers là phần thưởng; "gamification nhẹ" đúng tinh thần user |
| (c) Y-từ = **practicedToday** (distinct từ có ≥1 sự kiện đúng hôm nay, learn + review) — UNIFY với ring `/vocabulary` | đúng nguyên văn "Y từ ôn/l luyện" của user; một con số thật trên mọi trang; số chỉ TĂNG so với planted-only (kinder); XP rules không đổi |
| (d) Shield: auto-grant 1 credit/tháng VN (lazy, idempotent RETURNING-gated) + auto-consume khi lỡ ngày; cap tích 2; lookback 7 ngày | không shop/equip UI; consumption nằm trong tx FOR UPDATE sẵn có; dead-day edge-case tránh được |
| (e) Quest KHÔNG XP — không leaderboard view branch 3 | view 0006 vừa khép lỗi divergence weekly/all_time; nguồn XP thứ 3 nhân đôi audit surface cho giá trị học-viên nhỏ (extension path §8) |

**Second-order đáng nhớ:** `computeStreak` callers THẬT: `submit-attempt.ts:173`, `vocab-xp-store.ts:165`, `dashboard-store.ts:106`, `daily-plan.ts:74` (DEAD — không đụng); freeze consume chỉ ở 2 write-path qua MỘT choke point `recomputeStreakTx`, dashboard chỉ ĐỌC freeze-set; `lesson_parts.duration_ms` nullable → upsert PHẢI `coalesce(duration_ms, 0)` (NULL + int NOT NULL = constraint violation); `vocab_activity` KHÔNG phân biệt session learn/review → `reviewedToday` xấp-xỉ pinned §2.4; migration slot = số trống kế tiếp TẠI THỜI ĐIỂM SF chạy (đọc `drizzle/` — kỳ vọng 0007/0008 tuỳ VU-43 phase-2); `quest_completions` PK prefix-covers `(user_id, date)` — không cần index thêm.

## 2. UX flows (khung cứng — visual do designer phase SF-3, CREATIVITY BALANCED)

### 2.1 Trang `/[locale]/today` — "Hôm nay học gì"
- RSC `force-dynamic`, auth-gated (guest → `redirect(/${locale}/login?next=/${locale}/today)` — pattern `/me`). `setRequestLocale` đầu tiên; namespace i18n `today`.
- **Hero goal kép**: 2 ring (phút nghe hôm nay / `daily_goal_minutes` — và từ ôn-luyện hôm nay / `daily_goal_words`) + trạng thái "hoàn thành cả 2" (celebration tĩnh, reduced-motion-safe). Ring dùng pattern `dashboard-goal-ring` (aria-label tỉ số, role=img).
- **Chỉnh goal inline**: preset phút 5/15/30, preset từ 5/10/20, free input phút 5..120 / từ 1..100 — phút qua `PATCH /api/today/goal`, từ qua `/api/vocabulary/goal` CŨ (một field một route — không đụng contract route vocab).
- **Gợi ý "học gì kế tiếp"** (thứ tự ưu tiên theo remaining goal):
  1. **Dictation**: card "Bài nghe kế tiếp" — resolver cross-UNIT mới `getNextDictationTarget` (§3.4), CTA deep-link `/books/{book}/units/{unit}/lessons/{n}/listen-and-type`; progress `doneParts/totalParts`; mọi sách xong → trạng thái hoàn thành.
  2. **Vocab ôn**: card "N từ đến hạn" — due count (rolling `due_at <= now()`, nguồn `getHubStats().dueToday`), CTA `/me/vocabulary?scope=all`.
  3. **Vocab học mới**: card "Level kế tiếp sách X" — reuse `getContinueTarget` (type trả về `ContinueCard`, `dashboard-store.ts:335`), CTA `/vocabulary/learn/[bookId]`; hết → "hoàn thành sách".
- **Quest hôm nay**: 3 quest deterministic (§2.4), progress bar + trạng thái done (auto — KHÔNG nút claim).
- **Badge strip**: badge đã nhận + locked với mốc kế tiếp gần nhất.
- **Streak card**: số streak (nguồn §3.2) + shield status read-only (credits còn / cap, "được bảo vệ" khi có freeze covering gap gần nhất — chỉ display).
- KHÔNG nhân bản card dashboard `/vocabulary` (garden strip, per-book bars KHÔNG xuất hiện ở /today) — /today trả lời "hôm nay làm gì", dashboard vocab trả lời "hành trình sách".

### 2.2 Goal engine (server-side) — semantics cứng
- **Day boundary** = `vnToday()` VN (`Asia/Ho_Chi_Minh`) — tái dùng `streak.ts`, không copy TZ logic.
- **Phút nghe hôm nay** (`listenMinutesToday`) = `daily_activity.listen_ms / 60000`. Materialize: mỗi part đóng góp `coalesce(duration_ms, 0)` ĐÚNG MỘT lần trong NGÀY — lúc attempt đầu tiên của (user, part) trong ngày VN (gate `isFirstToday` pattern `submit-attempt.ts`); re-attempt cùng part cùng ngày không cộng lại. Part không có duration góp 0 — hero hiển thị chú thích "phút ước tính từ audio" khi bài hiện tại thiếu duration.
- **Từ ôn/luyện hôm nay** (`practicedToday`) = COUNT(DISTINCT word_id) trên `vocab_activity` WHERE correct AND kind IN ('learn-complete','session-step') AND VN-day = today. Bao trùm planted (learn-complete luôn kèm bước đúng). **Định nghĩa này UNIFY toàn hệ** (§3.5). `goalStatus` thuần giữ shape `{done, remaining, pct}` (tên param `plantedToday` giữ nguyên — chỉ đổi nghĩa đầu vào, doc comment ghi rõ).
- **GoalDone kép** = minutes-done AND words-done (cả 2). Reminder dot tắt khi goalDone kép.
- **XP rules VU-37 KHÔNG ĐỔI** — goal engine chỉ ĐO, không thưởng.

### 2.3 Streak shield — auto-grant + auto-consume
- **Grant**: đầu mỗi tháng VN (lazy, trong snapshot tx §3.2): `INSERT shield_grants (user_id, month) ON CONFLICT DO NOTHING RETURNING` — CHỈ khi RETURNING có row mới `UPDATE profiles SET shield_credits = least(shield_credits + 1, 2)` (cùng tx — chống double-credit khi 2 tab render đồng thời; ON CONFLICT bảo vệ insert, KHÔNG tự động bảo vệ increment). Đã đầy 2 → grant tháng đó bỏ, không hoàn lại.
- **Consume**: trong `recomputeStreakTx(tx, userId, today)` (mới, `src/lib/gamification/streak-store.ts`) — duyệt lùi từ hôm qua, gặp ngày KHÔNG có `daily_activity` row: nếu credits > 0 → INSERT `streak_freezes (user_id, date)` (PK idempotent) + credits −1, tiếp tục duyệt; hết credit dừng. Lookback cap 7 ngày gap. Freeze-set (dates) truyền vào `computeStreak(dates, today, frozen)`.
- **`computeStreak(dates, today, frozen = new Set())`**: frozen chứa date ⇒ ngày đó được coi như có hoạt động khi walk-back. **Frozen rỗng ≡ byte-identical hành vi cũ** — identity test pinned (backward-compat gate). Chỉ `recomputeStreakTx` được tạo freeze rows.
- **Wiring (SF-4)**: `submit-attempt.ts` + `vocab-xp-store.ts` thay inline-recompute bằng `recomputeStreakTx` (2 write-path cùng một choke point). `dashboard-store.getDashboardSummary` + today-store: streak = LIVE `computeStreak(dates, today, freezeSet)` trên daily_activity lookback (đọc `streak_freezes` — KHÔNG consume). `daily-plan.ts` dead — KHÔNG đụng.
- **`profiles.streak_count` là cache** (chỉ recompute trong write-path): header/UserMenu đọc cache có thể lệch tạm thời với live streak — hành vi sẵn có, giữ nguyên.
- **Rollback caveat**: revert code sau khi user có freeze rows ⇒ streak họ có thể tụt (gap thật lộ lại) — chấp nhận document, mitigated bằng shield nằm SF cuối (Phase 2).

### 2.4 Quest — pool static, 3 quest/ngày, auto-record
- **Selection (pinned)**: hash = SHA-256(`${userId}:${date}`) hex; sort quest-id pool theo (hash-slice-8byte của `${hash}${questId}`) ascending; lấy 3 đầu. Thuần, deterministic mọi render/restart (KHÔNG Math.random). Vitest pin: cùng (userId, date) → cùng 3 quest, mọi server.
- **Pool 7 quest (id → predicate trên TodaySnapshot)**: `q-parts-3` partsToday≥3 · `q-parts-5` partsToday≥5 · `q-listen-goal` listenMinutesToday≥dailyGoalMinutes · `q-review-5` reviewedToday≥5 · `q-plant-3` plantedToday≥3 · `q-goal-words` practicedToday≥dailyGoalWords · `q-goal-dual` goalDone.both (progress = số goal con đạt 0..2, target 2).
- **reviewedToday** (pinned, xấp-xỉ chủ đích) = COUNT(DISTINCT word_id) correct `session-step` hôm nay TRỪ các từ có `learn-complete` hôm nay.
- **Auto-record**: trong snapshot tx — quest predicate đúng + chưa có row → INSERT `quest_completions` ON CONFLICT DO NOTHING RETURNING (ledger cho badge tiers + lịch sử; không reward per-quest, không nút claim, không XP). `newlyCompletedQuests` = RETURNING list.
- **i18n key convention (pinned)**: tên/mô tả quest + badge = keys `today.json`: `quests.<questId>.{title,desc}` + `badges.<badgeId>.{title,desc}` (SF-1 defs chỉ chứa id + target; SF-3 điền keys vi/en đủ 7 quest + 13 badge).
- **Đổi pool sau này** = đổi code + i18n key (versioning qua git) — KHÔNG bảng quest admin.

### 2.5 Badge — pool static 13, lazy award
- Pool: `streak-3/7/30/100` (profiles.streak_count) · `active-days-10/50/200` (COUNT daily_activity rows) · `words-learned-10/100/1000` (COUNT user_word_progress reps≥1) · `listen-60/600` (getMyStats listenMinutes all-time — KHÔNG phải tổng listen_ms) · `quests-5/25/100` (COUNT quest_completions).
- **Lazy award** trong snapshot tx: milestone eval thuần (badges.ts trên snapshot + aggregates) → INSERT `user_badges` ON CONFLICT DO NOTHING RETURNING; `newlyEarnedBadges` = RETURNING list (UI toast đúng 1 lần). KHÔNG double-award (PK).
- **`words-learned-*` / `active-days-*` cần aggregate all-time** — 2 COUNT query thêm trong fan-out (index PK sẵn có), KHÔNG load rows.

### 2.6 Reminder (tối giản, in-app only)
- **Nav dot**: link "Hôm nay" (header, cả mobile) có dot khi user đăng nhập AND goalDone kép = false hôm nay. `TodayNavDot` client-island nhỏ đọc `readMyStats()` MỞ RỘNG `{xp, streak, goalDone}` (tính goalDone trong action từ daily_activity×vocab_activity hôm nay — 2 count query nhỏ; my-stats.ts đang chạy theo session nên KHÔNG force-dynamic thêm trang nào), refresh qua event `ilec:stats-updated`.
- **Dispatch event**: hiện CHỈ `dictation-lesson.tsx` dispatch — SF-3 THÊM dispatch `notifyStatsUpdated()` vào `session-runner.tsx` sau mỗi POST grade thành công (đugar-cả 2 path dictation + vocab → dot cập nhật ngay).
- KHÔNG banner trang chủ, KHÔNG toast định kỳ, KHÔNG localStorage throttle (dot là state thuần server-derived). Guest: không dot, link vẫn dẫn /today (tự redirect login).

## 3. Data model + contracts

### 3.1 Migration (MỘT migration additive — slot = trống kế tiếp khi SF chạy, đọc `drizzle/`)
```
ALTER TABLE daily_activity ADD COLUMN listen_ms integer NOT NULL DEFAULT 0;   -- + backfill
ALTER TABLE profiles        ADD COLUMN daily_goal_minutes integer NOT NULL DEFAULT 10;
ALTER TABLE profiles        ADD COLUMN shield_credits integer NOT NULL DEFAULT 0;
CREATE TABLE streak_freezes    (user_id text FK profiles cascade, date date, consumed_at timestamptz default now(), PK(user_id, date));
CREATE TABLE shield_grants     (user_id text FK profiles cascade, month text, granted_at timestamptz default now(), PK(user_id, month));  -- month = 'YYYY-MM' VN
CREATE TABLE quest_completions(user_id text FK profiles cascade, date date, quest_id text, recorded_at timestamptz default now(), PK(user_id, date, quest_id));
CREATE TABLE user_badges       (user_id text FK profiles cascade, badge_id text, awarded_at timestamptz default now(), PK(user_id, badge_id));
```
- **Backfill (pinned)**: cho mỗi (user_id, part_id, VN-day) có ≥1 attempt ANY → cộng `coalesce(duration_ms, 0)` ĐÚNG 1 lần vào `daily_activity.listen_ms` của (user, day) tương ứng (tạo row nếu chưa có — Parts_done giữ nguyên, KHÔNG đụng presence semantics). Parity test vitest đối chiếu migration-SQL với derive-SQL định nghĩa này trên fixture. Go-forward (§2.2) cùng rule per-day-first-attempt.
- KHÔNG đụng: leaderboard view, `words`/`book_words` (VU-32), bảng admin CMS (VU-43), `attempts`/`vocab_activity`/`user_word_progress` schema.

### 3.2 `getTodaySnapshot(userId, now): Promise<TodaySnapshot>` — today-store.ts
```ts
{ date, listenMinutesToday, dailyGoalMinutes, practicedToday, plantedToday, dailyGoalWords,
  partsToday, dueToday, reviewedToday,
  streak /* LIVE computeStreak(dates, today, freezeSet) — không phải cache */, activeToday,
  goalDone: {minutes, words, both},
  dictationNext: {bookSlug, unitNumber, lessonNumber, title, doneParts, totalParts} | null,
  vocabContinue: ContinueCard | null,          // reuse getContinueTarget (dashboard-store.ts:335)
  quests: {questId, progress, target, done, recorded}[],   // đúng 3 quest hôm nay theo §2.4
  newlyCompletedQuests: string[], newlyEarnedBadges: string[],
  badges: string[],                            // đã nhận (mọi milestone đạt, KHÔNG chỉ mới)
  shield: { credits, cap, freezes: string[] } } // read-only display
```
Thực thi (pinned): (1) fan-out `Promise.all` các read nhánh độc lập (profiles/daily_activity/vocab-activity-aggregates/due/dictation-next/continue/quest+badge aggregates/badges/freezes — pattern `hub-overview-section`), build-safe fallback từng nhánh (pattern `dashboard-store`); (2) SAU fan-out, MỘT tx ghi nhỏ `await` TRONG snapshot (không fire-and-forget — serverless giết sau response): monthly grant §2.3 + auto-record quests §2.4 + award badges §2.5 (mỗi bước ON CONFLICT DO NOTHING RETURNING); tx fail → snapshot vẫn trả (read đã có), ghi log, throw-không.

### 3.3 API — MỘT route mới duy nhất
- `PATCH|POST /api/today/goal` body `{minutes: int 5..120}` → `{ok, dailyGoalMinutes}`. Taxonomy mirror `/api/vocabulary/goal`: 401 `not-authenticated` · 400 `invalidJson|invalidMinutes` · 500 generic. (Goal TỪ giữ nguyên route `/api/vocabulary/goal` cũ.)
- KHÔNG route snapshot (RSC-only), KHÔNG route claim/equip (auto).

### 3.4 Resolver mới: `getNextDictationTarget(userId)`
Bài published ĐẦU TIÊN theo `books.sort_order → units.sort_order → lessons.number` mà CHƯA done (not mọi part có attempt accuracy≥1), ưu tiên sách user đang đọc (có `user_lesson_progress` — pattern reading-preference `getContinueTarget` `dashboard-store.ts:371-404`); fallback bài đầu tiên toàn hệ. Trả card shape §3.2. SQL-side, KHÔNG load-all parts hệ thống (top-first + per-lesson check theo thứ tự).

### 3.5 Unify counter (BREAKING-ISH — BIG-FLAG §8) — field RENAME outright, không alias
- `DashboardSummary.plantedToday` → `practicedToday` (query §2.2). Consumers cập nhật CÙNG SF (đều internal): `hub-overview-section.tsx:76`, `dashboard-stats-row.tsx` (prop `planted` → `practiced`), vitest `hub-overview-section.test.ts`/`dashboard-store.test.ts`, e2e 3319 aria pins + `vocabulary-dashboard-fixture.ts`.
- POST session `goalDone`: `countLearnCompleteToday` → `countPracticedToday` ở CẢ HAI call sites `learn-session-store.ts` (khoảng 387-390 và 603-606 — kể cả duplicate-reconstruct path).
- Ring `/vocabulary`: label/aria i18n `messages/{en,vi}/vocabulary.json` (`goalCardLabel`, `goalRingAria`) đổi "từ mới hôm nay" → "từ ôn/luyện hôm nay". `goalStatus` param giữ tên `plantedToday` (doc comment ghi nghĩa mới).
- `DashboardGoalRing` presets 5/10/20 + PATCH words KHÔNG đổi.

## 4. Acceptance (browser/e2e — trừ mục ghi rõ)

1. Đăng nhập `/vi/today` + `/en/today`: hero goal kép đúng số liệu thật (so tay QA seeded), 3 suggestion card đúng (dictation next đúng bài chưa done kế tiếp theo thứ tự sort; due count khớp `getHubStats`; continue level khớp dashboard vocab) — thấy bằng MẮT (screenshot), không chỉ DOM.
2. Nghe 1 part dictation (accuracy bất kỳ) → quay lại /today: phút tăng đúng `coalesce(duration)` part đó (lần đầu trong ngày); attempt lại cùng part cùng ngày KHÔNG cộng thêm.
3. Ôn 5 từ due đúng (review session `/me/vocabulary`) → practicedToday +5, quest `q-review-5` (nếu nằm trong 3 quest hôm nay của QA user — fixture pin hash) done TỰ ĐỘNG, reload không lặp record (ledger idempotent); fixture seed 4 quest_completions trước → hoàn thành quest thứ 5 ⇒ badge `quests-5` tự nhận ĐÚNG 1 LẦN, toast hiện đúng 1 lần (binary: đúng badge đó, không badge khác).
4. Đạt goal kép → goalDone.both = true, nav dot TẮT ngay sau hoạt động vocab (qua event dispatch mới — không cần reload); PATCH `/api/today/goal {minutes:15}` → ring đổi + persist (reload giữ); guest PATCH → 401.
5. Streak shield (e2e seed): user A có 2 credit + daily_activity seed HÔM NAY + HÔM KIA (bỏ trống HÔM QUA = gap) + hoạt động lại hôm nay ⇒ streak tính TỪ HÔM KIA (freeze row tạo cho hôm qua, credit −1); user B cùng seed, 0 credit ⇒ streak = 1 (chỉ hôm nay). Identity: mọi suite streak vitest hiện có xanh (frozen rỗng ≡ cũ).
6. Ring `/vocabulary` + POST session `goalDone` dùng practicedToday (label mới "từ ôn/luyện") — e2e 3319 update xanh; guest /today → login redirect; guest nav không dot.
7. i18n vi/en parity (`src/messages.test.ts`); a11y: keyboard qua hết page, ring aria-label, `prefers-reduced-motion`, touch ≥44px; mobile 375 usable (screenshot).
8. *(vitest/integration — không browser)*: store tests (snapshot fallback-safe từng nhánh, auto-record idempotent, monthly grant idempotent + RETURNING-gated + cap 2, `recomputeStreakTx` consume order/exhaust/7-day cap); route taxonomy pin; backfill parity (§3.1 rule trên fixture); quest selection determinism (cùng user+date → cùng 3).
9. *(suite)*: toàn bộ e2e configs repo (mọi `test:e2e:*` trong package.json) + mới **3321** xanh liên tiếp; `test:rls` xanh (story đụng schema).

## 5. Boundary (KHÔNG làm)

Quest XP + leaderboard branch 3 (extension §8) · email/push/web-push/cron · shop/gem/economy · manual shield equip · claim button/claim API · admin CRUD quest/badge · đổi SRS/SM-2/XP rules VU-37 (§4 spec cũ) · đổi heatmap `/me` semantics + `getMyStats` shape (không thêm field — /me giữ listenMinutes all-time) · clone card dashboard `/vocabulary` (garden/per-book bars) · home redirect → /today · đụng `daily-plan.ts`/`daily-plan-store.ts` (dead code giữ nguyên, kể cả wiring) · banner/toast reminder ngoài nav-dot · đụng crawl VU-32 (`words` read-only) + admin surfaces VU-43.

## 6. Testing & release

- **Vitest pure**: `today-engine` (dual-goal edges, quest predicate truth-table target-1/target), `quests` (selection deterministic pinned §2.4 — SHA-256 rule), `badges` (milestone eval), `streak` extend (freeze bridge 1-gap/multi/freeze-hôm-nay no-op/**identity frozen rỗng ≡ legacy**), `shield-planner` (consume order, cap 2, lookback 7).
- **Store tests** mock `@/db` theo pattern `vocab-xp-store.test.ts` (canonical sống): `today-store` (fan-out, fallback, auto-record, grant RETURNING-gated), `streak-store` (`recomputeStreakTx`), route `/api/today/goal` taxonomy.
- **E2e**: `playwright.today.config.ts` **port 3321** (3320=oxford-crawl ĐÃ DÙNG — verified), fixture `qa-today-*` idempotent globalSetup (pattern vocabulary-dashboard). **Quest-hash pin mechanism (pinned — chống flaky theo ngày)**: selection đổi theo (userId, date) nên globalSetup TÌM user-id tại runtime — lặp `qa-today-<n>` (n=0..) gọi lib selection SF-1 với `vnToday()` hiện tại cho tới khi 3-quest set chứa `q-review-5` (deterministic, rẻ), rồi seed user đó — mọi ngày chạy đều có quest cần test. Specs: `today-page` (guest/rings/cards/vi-en), `today-quest` (auto-record + badge quests-5 đúng 1 lần + no-reaward), `today-shield` (user A/B §4.5).
- **Phased release**: Phase 1 = SF-1..SF-3 (checkpoint SAU tier 2 merge: build + full suites + security-audit sạch P0/P1 — quest auto-record + goal API là surface mới) → **Phase 2** = SF-4 (streak invariant wiring + /me hiển thị + convergence; audit cuối).
- **Design-first**: SF-3 visual-heavy → `design: mock-prototype`; MỘT designer phase trước launch SF-3 (3 hướng HTML → USER CHỌN → hand-off `docs/superpowers/designs/daily-journey-direction.md`); SF-1/SF-2 không đợi design.
- **RLS rerun** `test:rls` trong story-verify (story đụng schema — convention VU-43).

## 7. Rủi ro (P0 → đã xử trong spec v2)

1. **HIGH** streak invariant (freeze-aware recompute sai = corrupt `streak_count`) → choke-point `recomputeStreakTx` duy nhất + identity test + shield dồn SF-4 (Phase 2, sau checkpoint+audit); dashboard/today đọc LIVE freeze-aware (không phải cache lệch). 2. **HIGH** unify counter đổi semantics ring vừa ship (VU-37) → field rename outright + CẢ HAI call sites goalDone (kể cả duplicate-reconstruct) + e2e 3319 update cùng SF (BIG-FLAG §8 cho user duyệt). 3. **MED** migration slot contention VU-43 phase-2 → rule "slot trống tại thời điểm chạy", schema.ts vùng khác nhau merge được. 4. **MED** `duration_ms` nullable → `coalesce` PIN trong upsert + backfill (NULL + NOT NULL = constraint violation). 5. **MED** write-on-read (grant/record/award trong SSR render) → MỘT tx await trong snapshot, ON CONFLICT DO NOTHING RETURNING mọi bước, tx fail không đổ snapshot. 6. **MED** dot stale sau hoạt động vocab (event chỉ dispatch ở dictation) → thêm dispatch ở session-runner (touch map §1). 7. LOW: port 3321 (verified free), i18n parity auto-test, backfill một chiều idempotent.

## 8. BIG-FLAGS (quyết định PM theo CREATIVITY: BALANCED — user có thể override ở STORY-READY/approve)

1. **Y-từ = practicedToday (broad) unify toàn hệ** — đúng nguyên văn "ôn/l luyện" của user; thay đổi label + semantics ring `/vocabulary` (planted-only → practiced). Revert điểm: SF-2 (query + label).
2. **Quest KHÔNG XP** — giữ XP economy + leaderboard view nguyên vẹn; thưởng = badge tiers. Extension path: bảng `quest_completions` + view branch 3 (pattern 0006) khi product muốn.
3. **Shield kinh tế**: auto 1 credit/tháng VN, cap 2, auto-consume, lookback 7 ngày — tham số là constants pin trong tests, đổi dễ.
4. **Không claim button** (auto-record) — "tối giản" đúng mô tả user; claim-ritual là future enhancement.
5. **Reminder = nav-dot only** — không banner/toast/email (repo không infra); dot refresh qua event (dictation sẵn + vocab thêm).
6. **Migration slot**: kỳ vọng 0007/0008 tuỳ VU-43 phase-2 merge trước hay sau — rule tại-thời-điểm-chạy.

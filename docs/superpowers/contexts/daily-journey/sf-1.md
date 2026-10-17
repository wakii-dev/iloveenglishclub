# SF-1 Context Pack — Nền tảng: migration + pure libs + listen_ms write-path
> Đọc file này THAY VÌ tự tổng hợp từ story .wakii + epic + comments. Epic spec: `docs/superpowers/specs/2026-10-13-daily-journey-design.md` (v2). Story .wakii: `docs/superpowers/mindmaps/daily-journey.wakii`.

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)
1. **Migration MỘT file additive** — slot = số trống kế tiếp TẠI THỜI ĐIỂM CHẠY (đọc `drizzle/meta/_journal.json`, hiện đầu = 0006; VU-43 phase-2 có thể chiếm 0007 trước — ĐỌC rồi mới đặt tên):
   - `daily_activity` + `listen_ms integer NOT NULL DEFAULT 0` + backfill §spec-3.1: cho mỗi (user_id, part_id, VN-day) có ≥1 attempt ANY → cộng `coalesce(duration_ms, 0)` ĐÚNG 1 lần vào `listen_ms` của (user, day); row chưa có thì TẠO (chỉ set listen_ms — KHÔNG đụng parts_done/presence semantics).
   - `profiles` + `daily_goal_minutes integer NOT NULL DEFAULT 10`, + `shield_credits integer NOT NULL DEFAULT 0`.
   - 4 bảng mới: `streak_freezes(user_id, date, consumed_at, PK(user_id,date))`, `shield_grants(user_id, month text 'YYYY-MM' VN, granted_at, PK(user_id,month))`, `quest_completions(user_id, date, quest_id, recorded_at, PK(user_id,date,quest_id))`, `user_badges(user_id, badge_id, awarded_at, PK(user_id,badge_id))` — FK profiles cascade hết.
   - `schema.ts` additive-only (đọc trước xem 0005 `vocab_steps` thêm cột kiểu gì để theo).
2. **`computeStreak(dates, today, frozen = new Set())`** — optional 3rd param trong `src/lib/gamification/streak.ts`: ngày trong frozen được coi như có hoạt động khi walk-back. **Frozen rỗng ≡ byte-identical hành vi cũ** — identity test là backward-compat gate. Extend `streak.test.ts`: freeze bridge 1-gap, multi-freeze, freeze-hôm-nay (no-op — hôm nay đã active), identity.
3. **Shield-planner pure** (`src/lib/gamification/shield-planner.ts`): `planFreezes(dates: string[], today: string, credits: number, cap=2, lookback=7): {freezeDates: string[], creditsLeft: number}` — duyệt lùi từ hôm qua, gap + credits>0 → freeze, hết credit/cap lookback dừng. Thuần, không DB.
4. **`today-engine.ts` pure** (`src/lib/today/`): dual-goal status — `goalStatus` vocab (`src/lib/vocabulary/daily-goal.ts`) giữ nguyên param name `plantedToday`; today-engine bọc `dualGoalStatus({minutesToday, goalMinutes, practicedToday, goalWords}) → {minutes:{done,remaining,pct}, words:{...}, both: boolean}`.
5. **`quests.ts` defs + selection pure**: pool 7 quest id đúng spec §2.4 (`q-parts-3, q-parts-5, q-listen-goal, q-review-5, q-plant-3, q-goal-words, q-goal-dual`) — mỗi def `{questId, target, metric}`; `selectQuests(userId, date): [questId, questId, questId]` = SHA-256(`${userId}:${date}`) hex → sort pool theo hash-slice của `${hash}${questId}` asc → lấy 3. q-goal-dual: progress = số goal con (0..2), target 2. Defs CHỈ id+target (tên i18n là `today.json` `quests.<questId>.{title,desc}` — SF-3 điền).
6. **`badges.ts` defs + eval pure**: pool 13 đúng spec §2.5 (`streak-3/7/30/100, active-days-10/50/200, words-learned-10/100/1000, listen-60/600, quests-5/25/100`); `evalBadges(stats) → badgeId[]` thuần.
7. **Write-path hunk `submit-attempt.ts`**: trong upsert `daily_activity` sẵn có (khoảng dòng 159-166, gate `isFirstToday`) thêm `listen_ms: sql`coalesce + part.durationMs`` — CHỈ hunk này. **KHÔNG đụng** inline-recompute block ngay dưới (dòng ~167-177 — territory SF-4, ghi READ-ONLY).

## Touch map (files SF-1 tạo/sở hữu)
```
drizzle/000X_<name>.sql                    CREATE (X = slot trống khi chạy)
src/lib/today/today-engine.ts + .test.ts   CREATE
src/lib/today/quests.ts + .test.ts         CREATE
src/lib/today/badges.ts + .test.ts         CREATE
src/lib/gamification/shield-planner.ts + .test.ts  CREATE
src/lib/gamification/streak.ts             MODIFY (+frozen param)
src/lib/gamification/streak.test.ts        MODIFY (extend)
src/db/schema.ts                           MODIFY (additive-only)
src/lib/actions/submit-attempt.ts          MODIFY (CHỈ upsert hunk ~159-166)
src/lib/gamification/streak-store.ts       KHÔNG tạo (SF-4)
```
READ-ONLY (SF khác): `submit-attempt.ts` recompute block ~167-177 (SF-4), `dashboard-store.ts` (SF-2/SF-4), mọi UI/components (SF-3), `learn-session-store.ts` (SF-2), e2e/ (SF-3/SF-4).

## ACCEPTANCE (user-visible / nghiệm thu)
- Migration chạy xanh trên Neon (dry-run trước theo convention story đụng schema); không đứt dữ liệu: `daily_activity` rows cũ nguyên vẹn, chỉ +listen_ms.
- Sau 1 attempt dictation THẬT (browser hoặc script): `daily_activity.listen_ms` hôm nay tăng ĐÚNG `coalesce(duration_ms)` của part đó nếu đó là attempt đầu của part trong ngày; attempt lại cùng part cùng ngày KHÔNG cộng thêm (integration test pin).
- Mọi pure test xanh: identity frozen-rỗng ≡ legacy (streak), planFreezes consume order/cap/lookback, selectQuests deterministic (cùng input → cùng 3, mọi "server" = thuần), dualGoalStatus edges (0-goal, cả-hai-done, một-done).
- Merge probe gồm: `npm test` + `npm run test:rls` (story đụng schema — convention VU-43).

## Boundary (KHÔNG làm)
- KHÔNG wiring `recomputeStreakTx`/consume freeze vào write-paths (SF-4) — SF-1 chỉ pure planner.
- KHÔNG tạo `today-store.ts`/snapshot/API route (SF-2).
- KHÔNG UI/i18n messages/e2e (SF-3) — kể cả keys `today.json`.
- KHÔNG đụng `dashboard-store.ts`, `learn-session-store.ts`, `vocab-xp-store.ts`, `queries.ts`, `daily-plan*.ts` (dead).
- KHÔNG đổi semantics `parts_done`/`vocab_steps`/heatmap presence.

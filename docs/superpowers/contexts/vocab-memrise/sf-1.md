# SF-1 Context Pack — Nền tảng XP vocab + schema + libs thuần (tier 0)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2). Bracket plan: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md`. Story: VU-37, dest `story-vu37-vocab-memrise`, Phase 1/2 (checkpoint sau tier 2).

## Spec slice (SF-1 chịu trách nhiệm)

1. Migration ADDITIVE trên Neon (dry-run trên template trước apply — convention repo): bảng `vocab_activity(id identity, user_id FK profiles cascade, word_id FK words cascade, kind text CHECK in ('learn-complete','session-step'), correct boolean NOT NULL, xp int NOT NULL, session_key text NOT NULL, step_index int NOT NULL, attempt_no int NOT NULL, idempotency_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL default now())` + index `(user_id, created_at)` + index `(user_id, word_id)`; cột `profiles.daily_goal_words int NOT NULL default 5`; cột `user_word_progress.lapses int NOT NULL default 0`; cột `daily_activity.vocab_steps int NOT NULL default 0`.
2. Migration leaderboard view (drop/recreate — KHÔNG additive): `leaderboard` weekly branch = UNION ALL 2 nhánh `attempts.xp` và `vocab_activity.xp`, CẢ HAI join qua `profiles` (user chỉ học vocab, 0 attempt dictation, vẫn phải hiện), `SUM(...)::int`, ISO tuần bucket TZ `Asia/Ho_Chi_Minh`; all_time giữ `profiles.xp` (>0). Soi definition hiện có trong `src/db/schema.ts` (pgView leaderboard) trước khi viết.
3. `src/db/schema.ts`: exports Drizzle cho bảng/cột mới (đặt cạnh định nghĩa hiện có, đúng style file).
4. `src/lib/vocabulary/vocab-xp.ts` (thuần, client-safe): bảng XP rules — learn-complete = 4 XP, session-step đúng = 1 XP; builder `idempotencyKey(userId, sessionKey, wordId, stepIndex, attemptNo)`; hàm quyết định lần-đầu-trong-ngày (nhận list flag đã-có-correct-hôm-nay) + learn-complete-lần-đầu (nhận flag đã-tồn-tại-kind); cap 60 XP/ngày → trả `{xpAwarded, xpCapped}`. Số 4/1/60 pin trong tests.
5. `src/lib/vocabulary/vocab-xp-store.ts` (DB leg): transaction MỘT khối theo pattern `src/lib/actions/submit-attempt.ts` (lock row, `ON CONFLICT DO NOTHING` theo idempotency_key — duplicate trả kết quả cached KHÔNG ghi SRS lần 2; check lần-đầu-trong-ngày = query tồn tại row `(user, word, correct=true, created hôm nay VN)`; cộng `profiles.xp` có điều kiện; upsert `daily_activity` tăng `vocab_steps` — presence row giữ streak); Hàm sign trả `{xpAwarded, xpCapped, totalXp, streak}`.
6. `src/lib/vocabulary/growth.ts` (thuần): bảng boundary 8 mức theo spec §2.4 — stage 0 `reps=0`; 1 `<2`; 2 `<7`; 3 `<14`; 4 `<45`; 5 `<100`; 6 `<200`; 7 `≥200` (đo `intervalDays`); export `growthStage({reps, intervalDays})` + `GROWTH_STAGES` metadata (i18n key name mỗi stage).
7. `src/lib/vocabulary/levels.ts` (thuần): `WORDS_PER_LEVEL = 10`; từ input `[{wordId, order, reps}]` (đã JOIN sẵn) → levels chunk theo order; `nextLevel(levels)` = chunk ĐẦU TIÊN (theo order) còn ≥1 từ `reps = 0`; `levelProgress(levels)` planted/tổng per level + per book; edge: book 0 từ, hết level planted, chunk cuối lẻ.
8. Daily-goal helper (cùng file levels.ts hoặc file riêng `daily-goal.ts`): `goalStatus({plantedToday, goal})`, day boundary dùng `vnToday`/`ILEC_TZ` từ `src/lib/gamification/streak.ts` — TÁI DÙNG, không copy.
9. i18n: tạo `messages/{en,vi}/learn.json` skeleton — keys stage names (`learn.stage.0..7`), goal labels (`learn.goal.*`); parity vi/en tự động bởi `src/messages.test.ts` — chạy test này.
10. Tests vitest: từng lib một file test (`vocab-xp.test.ts`, `vocab-xp-store.test.ts` mock `@/db` theo `review-store.test.ts`, `growth.test.ts` pin bảng boundary, `levels.test.ts` pin edges, daily-goal) + integration test view migration (query weekly trả cả XP vocab cho user vocab-only — chạy trên DB thật template nếu config cho phép, ghi evidence).
11. Merge về đích + `~/.claude/bin/story-verify` sạch + audit comment (convention kit workflow).

## Touch map (SF-1 sở hữu)

```
drizzle/0005_*.sql                        (mới — additive)
drizzle/0006_*.sql                        (mới — view drop/recreate; số thứ tự kế tiếp empty slot)
src/db/schema.ts                          (sửa — exports mới, KHÔNG đụng định nghĩa cũ)
src/lib/vocabulary/vocab-xp.ts            (mới)
src/lib/vocabulary/vocab-xp-store.ts      (mới)
src/lib/vocabulary/growth.ts              (mới)
src/lib/vocabulary/levels.ts              (mới; daily-goal helper ở đây hoặc file riêng)
messages/en/learn.json, messages/vi/learn.json (mới skeleton)
+ file test tương ứng mỗi lib
```
READ-ONLY (khác sở hữu): `src/lib/vocabulary/{srs,review-store,hub-store,hub-status,study-store,daily-plan*}.ts`, `src/lib/gamification/**` (chỉ import), `src/lib/actions/submit-attempt.ts` (pattern reference), mọi page/component.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Trên DB đã migrate: user A (chỉ học vocab, không ever làm dictation) XUẤT HIỆN trong bảng weekly của `/top-users` với đúng tổng XP vocab; all_time khớp `profiles.xp`.
2. Gọi transaction award cùng `idempotency_key` 2 lần → XP chỉ cộng 1 lần, SRS/`vocab_steps` không tăng lần 2 (không double-apply).
3. User trả lời đúng cùng 1 từ 5 lần trong ngày (attemptNo mới) → chỉ lần đầu +1 XP; hôm sau đúng lại → lại được 1 XP.
4. Đạt cap 60 XP/ngày → các đáp án đúng sau đó `xpAwarded=0, xpCapped=true` nhưng `due_at` VẪN tiến đầy đủ.
5. `growthStage` đúng bảng 8 mức qua vitest (mỗi biên một case); `nextLevel` trả chunk đầu còn `reps=0`, sách hoàn thành → null/rỗng rõ ràng.

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG viết engine/API session (SF-2), KHÔNG viết UI nào (SF-3/SF-4), KHÔNG sửa hub page.
- KHÔNG đụng `words`, `book_words`, `quiz_attempts`, `crawl_entries` (VU-32 đang enrich song song — đọc `words` read-only khi test).
- KHÔNG đổi `getMyStats`/heatmap `/me` (giữ dictation-only theo spec §3).
- KHÔNG award XP cho quiz; KHÔNG đổi `nextReview` SM-2 (engine giữ nguyên).
- KHÔNG seed data production; fixture chỉ trong tests.

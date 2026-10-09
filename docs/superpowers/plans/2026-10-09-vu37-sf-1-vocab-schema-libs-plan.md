# VU-37 SF-1 — Nền tảng XP vocab + schema + libs thuần (VU-38) — plan

Spec slice: `docs/superpowers/contexts/vocab-memrise/sf-1.md` · Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2, post spec-critic) · Bracket: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md` §SF-1.

Worktree `sf-1-vocab-schema-libs` · base `wakii-dev/story-vu37-vocab-memrise` · Linear VU-38.
Boundary: KHÔNG engine/API (SF-2), KHÔNG UI (SF-3/4), KHÔNG đụng `words`/`book_words`/`quiz_attempts`/`crawl_entries`, KHÔNG đổi `getMyStats`/heatmap `/me`, KHÔNG award XP quiz, KHÔNG đổi `nextReview` SM-2.

## Tasks

- [ ] T1. Schema additive: `vocab_activity` + `profiles.daily_goal_words` + `user_word_progress.lapses` + `daily_activity.vocab_steps` trong `src/db/schema.ts` (style comment hiện có) → `drizzle-kit generate` ra `drizzle/0005_*.sql` + snapshot + journal
- [ ] T2. Leaderboard view: `drizzle/0006_*.sql` drop/recreate — weekly = UNION ALL 2 nhánh `attempts.xp` + `vocab_activity.xp` CẢ HAI join `profiles`, `SUM(...)::int`, ISO week TZ `Asia/Ho_Chi_Minh`; all_time giữ `profiles.xp > 0`; cập nhật pgView `leaderboard` trong `schema.ts`
- [ ] T3. `src/lib/vocabulary/vocab-xp.ts` thuần client-safe: hằng `LEARN_COMPLETE_XP=4`, `STEP_XP=1`, `DAILY_XP_CAP=60`; `idempotencyKey(userId, sessionKey, wordId, stepIndex, attemptNo)`; `firstCorrectToday`/`isFirstLearnComplete` quyết định từ flag đầu vào; `awardXp({correct, firstCorrectToday, firstLearnComplete, vocabXpToday})` → `{xpAwarded, xpCapped}` — TDD RED→GREEN `vocab-xp.test.ts` pin 4/1/60
- [ ] T4. `src/lib/vocabulary/vocab-xp-store.ts` DB leg: `awardVocabXp` MỘT transaction pattern `submit-attempt.ts` — lock `profiles` FOR UPDATE, count vocab XP hôm nay, insert `vocab_activity` ON CONFLICT DO NOTHING theo `idempotency_key` (duplicate → cached, không ghi lần 2), cộng `profiles.xp` có điều kiện, upsert `daily_activity` `vocab_steps` (presence giữ streak), recompute streak — test mock `@/db` transaction `vocab-xp-store.test.ts`
- [ ] T5. `src/lib/vocabulary/growth.ts` thuần: `GROWTH_STAGES` 8 mức (0 reps=0; 1 <2; 2 <7; 3 <14; 4 <45; 5 <100; 6 <200; 7 ≥200 theo `intervalDays`) + i18n key name — TDD RED→GREEN `growth.test.ts` mỗi biên một case
- [ ] T6. `src/lib/vocabulary/levels.ts` thuần: `WORDS_PER_LEVEL=10`; input `[{wordId, order, reps}]` → chunks theo `order`; `nextLevel` = chunk ĐẦU TIÊN còn ≥1 từ `reps=0`; `levelProgress` planted/tổng per level + per book; edges: book 0 từ, hết level planted, chunk cuối lẻ — TDD `levels.test.ts`
- [ ] T7. Daily-goal helper `goalStatus({plantedToday, goal})` trong `levels.ts` (hoặc `daily-goal.ts` nếu riêng) — day boundary tái dùng `vnToday`/`ILEC_TZ` từ `src/lib/gamification/streak.ts`, KHÔNG copy — tests edge goal 0/planted vượt goal
- [ ] T8. i18n `messages/{en,vi}/learn.json` skeleton — keys `learn.stage.0..7` (8 stage names) + `learn.goal.*` — `src/messages.test.ts` parity vi/en phải xanh
- [ ] T9. Integration (DB thật template Neon): migration dry-run 0000→0006 trên template + query view weekly trả XP vocab cho user vocab-only (0 attempt dictation) — evidence log; file test `*.integration.test.ts`
- [ ] T10. Full suite vitest exit 0 + `tsc --noEmit` + evidence `docs/superpowers/evidence/sf-1-vocab-schema-libs/test-run.txt` (dòng đầu `tdd:` + hash code commit) — Rule 0 proxy: thuần lib/SQL → CLI-equivalent = test suite + migration dry-run (ghi chú rõ trong evidence)
- [ ] T11. `~/.claude/bin/story-verify sf-1` sạch (B1/B2/B2b/B3 PASS; B4 FAIL = artifact không-merge — coordinator merge) + audit comment VU-38 + push `wakii-dev/sf-1-vocab-schema-libs` — KHÔNG merge, KHÔNG set Done

## Rolling review (CHECK 3 — không dồn 1 review cuối)

1. Nhóm A (T1–T4): code-reviewer độc lập trên diff schema+XP core ngay khi T4 xong
2. Nhóm B (T5–T8): code-reviewer độc lập trên diff pure libs+i18n
3. Nhóm C (T9–T11): review cuối + verdict `VERDICT: APPROVED` + literal `CHECKLIST-4Q` post lên VU-38 (B3 gate)

## Acceptance (từ context pack — verifier kiểm)

1. User vocab-only XUẤT HIỆN weekly `/top-users` với đúng tổng XP vocab; all_time khớp `profiles.xp`
2. Transaction cùng idempotency_key 2 lần → XP cộng 1 lần, SRS/vocab_steps không tăng lần 2
3. Đúng cùng 1 từ 5 lần/ngày → chỉ lần đầu +1 XP; hôm sau đúng lại → lại được
4. Cap 60 XP/ngày → sau đó `xpAwarded=0, xpCapped=true` nhưng `due_at` vẫn tiến đầy đủ
5. `growthStage` đúng bảng 8 mức; `nextLevel` trả chunk đầu còn `reps=0`, sách xong → null

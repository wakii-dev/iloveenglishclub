# VU-37 SF-2 — Session engine + API /api/vocabulary/session (VU-39) — plan

Spec slice: `docs/superpowers/contexts/vocab-memrise/sf-2.md` · Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2, post spec-critic) · Bracket: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md` §SF-2.

Worktree `sf-2-session-engine-api` · base `wakii-dev/story-vu37-vocab-memrise` · Linear VU-39.
Boundary: KHÔNG component/UI (SF-3), KHÔNG hub/dashboard (SF-4), KHÔNG đụng `src/components/`, KHÔNG sửa `srs.ts` engine (chỉ gọi), KHÔNG đổi schema (SF-1 xong — thiếu cột → FLAG), KHÔNG đụng legacy `/api/vocabulary/review` + `ReviewFlashcards` (SF-3 nghỉ hưu), KHÔNG trả đáp án qua payload, KHÔNG session table (stateless).
File-mới-only: `src/lib/vocabulary/learn-session.ts` · `learn-session-store.ts` · `src/app/api/vocabulary/session/route.ts` + tests · `scripts/qa-sf2-seed.ts` (fixture owner — pattern `e2e/vocabulary-learn-fixture.ts`).

## Phase 0 (compact — epic đã P0 full; context pack = impact analysis)

- **Touch map**: 3 file mới + 3 file test mới + 1 seed script — zero sửa file có sẵn (verify `git diff --stat` cuối run chỉ file mới).
- **Multi-dim**: functional (6 acceptance curl-kiểm được) · technical (split pure ⋈ store theo convention `srs.ts`/`review-store.ts`) · data (chỉ GHI `user_word_progress` + `vocab_activity` QUA `awardVocabXpTx` có sẵn — không migration) · perf (queue SQL-side bounded: OFFSET window 10 + count + LIMIT 5/50/500 — cấm load-all) · security (chấm server-side, payload không cờ đáp án, scope user) · backward-compat (route mới, không đụng route legacy) · UX (n/a backend — SF-3 render) · maintenance (tests mock `@/db` pattern `vocab-xp-store.test.ts`) · operational (error taxonomy spec §5) · business (n/a — slice epic).
- **Direction**: B1 engine mới pure⋈store — epic đã chốt, không fork lại.
- **Rủi ro env**: DB shared neondb CHƯA có migration SF-1 → template riêng `ilec_vu37_sf2` (đã tạo + migrate 0000→0006 trước T1).

## Tasks

- [x] T1. Types thuần `learn-session.ts`: `SessionKind` ('learn'|'review'), `StepKind` ('introduce'|'mc'|'listen'|'type'), `SessionStep` (context pack #1 — KHÔNG cờ đáp án; `example?` thêm cho introduce card theo epic §2.1), `GradeRequest`, `GradeResult`, `SessionWord` (row input engine), hằng `LEARN_SESSION_WORDS=5`
- [x] T2. `buildLearnSteps` thuần: input level rows (reps=0, ≤5) + distractor pool; chuỗi per từ introduce→mc→listen?(chỉ khi audioUrl)→type; đan xen batch 2: intro 2 từ mới → test-chains; MC tối đa 4 lựa chọn (pool <4 nghĩa phân biệt → giảm, <2 → bỏ MC); shuffle qua rng inject (test tất định); KHÔNG field đáp án trong payload — TDD RED→GREEN `learn-session.test.ts` (degenerate 6 từ, interleave order, listen-conditional, no-leak)
- [x] T3. `buildReviewSteps` thuần: per từ (listen khi có audio HOẶC mc nghĩa) → type; prefill = queue 1 từ; KHÔNG word text ở listen/type, meaningVi CHỈ prompt ở type — TDD `learn-session.test.ts`
- [x] T4. `gradeStep` thuần: mc/listen so meaning, type so word; normalize trim+lowercase+collapse-space (style `normKey` quiz.ts); typo tolerance edit-distance ≤1 với từ (target) ≥5 ký tự — bảng pin tests; chấm only, không ghi — TDD
- [x] T5. `qualityFromSteps` thuần: input mảng correct của attempt → mọi bước đúng q=4 / bất kỳ sai q=0; `lapsesDelta` q<3 → +1 — TDD (grade map pin)
- [x] T6. Store `getLearnSession`/`getReviewSession`: SQL-side bounded queue (min-unplanted-order → count-position → OFFSET window 10 JOIN words → `nextLevel` (levels.ts) → take 5; due `lte(due_at, now())` asc LIMIT 50; prefill 1 từ theo progress row) + sessionKey UUID + pool distractor LIMIT 500 — query-shape assertions (mock calls) — test mock `@/db`
- [ ] T7. Store `applyStep`: validate scope (learn: word ∈ book; review: progress row tồn tại) → `gradeStep` → duplicate idempotency (activity row có sẵn → reconstruct cached, ZERO write, không SRS lần 2) → MỘT transaction: `awardVocabXpTx` (session-step) → nếu type: quality từ attempt activities + `nextReview` upsert progress + lapses(q<3) + learn-complete award khi pre-reps=0→post≥1 + goalDone (count learn-complete today VN ≥ daily_goal_words) — test mock transaction (duplicate cached, instant-mastery 5 từ reps đúng 1, sai→lapses+1→retry XP như thường)
- [ ] T8. Route GET `?kind=learn|review&book=&word=` + POST `{sessionKey, kind, bookId, wordId, stepIndex, attemptNo, stepKind, response}` — error taxonomy: 401 not-authenticated · 400 invalidKind|invalidBook|invalidSession|invalidStep|invalidResponse (+invalidJson parse, kế thừa review route) · 404 sessionNotFound (no activity + scope hụt) | wordNotFound — steps:[] = 200 — test route (mock store + auth): taxonomy đầy đủ, success shape
- [ ] T9. Perf/query-shape §6.8: assertions mock-calls — OFFSET/LIMIT window 10, LIMIT 5 session, LIMIT 50 due + lte now() + asc due_at, LIMIT 500 pool, IN (≤5) details; KHÔNG select * toàn book — gộp vào store test (tách describe riêng)
- [ ] T10. Acceptance walkthrough (Rule 0 proxy — SF API-only): `scripts/qa-sf2-seed.ts` idempotent (book `qa-sf2-book` 12 từ 2 level + book `qa-sf2-book6` 6 từ prod-shape: 3 nghĩa phân biệt + 1 từ không audio; QA user) + dev server + login NextAuth credentials (node fetch csrf→callback) + curl flow 6 mục acceptance — evidence log `docs/superpowers/evidence/sf-2-session-engine-api/walkthrough.txt`
- [ ] T11. Full suite vitest exit 0 + `tsc --noEmit` + eslint changed files + evidence `docs/superpowers/evidence/sf-2-session-engine-api/test-run.txt` (dòng đầu `tdd:` + hash code commit — parent-convention B1)
- [ ] T12. `~/.claude/bin/story-verify sf-2-session-engine-api` + push `wakii-dev/sf-2-session-engine-api` + audit comment VU-39 (verdict reviews + CHECKLIST-4Q) — KHÔNG merge (coordinator), KHÔNG set Done

## Rolling review (CHECK 3 — không dồn 1 review cuối)

1. Nhóm A (T1–T5): code-reviewer độc lập trên diff engine pure ngay khi T5 xong
2. Nhóm B (T6–T9): code-reviewer độc lập trên diff store+route
3. Nhóm C (T10–T12): review cuối + verdict `VERDICT: APPROVED` + literal `CHECKLIST-4Q` post lên VU-39 (B3 gate)

## Acceptance (từ context pack — curl walkthrough T10 + tests)

1. GET `?kind=learn&book=<qa>` → steps đúng chuỗi introduce→mc→(listen khi audio)→type, không field đáp án; sách chưa học → level 1; level 1 planted hết → level 2
2. POST hết phiên 5 từ all-correct → mỗi từ reps tiến đúng 1 (không 3), XP = 4×5 + số bước đúng ×1, goalDone đúng khi đủ goal
3. Sai 1 bước → grade q=0, lapses+1, xpAwarded=0; retry attemptNo mới đúng → XP như thường
4. POST trùng stepIndex+attemptNo → kết quả cached, due_at/XP KHÔNG đổi
5. GET lại sau "reload" → queue còn lại đúng (planted biến mất; q=0 due 1d rời review queue; learn queue còn reps=0)
6. Book 6 từ (prod shape): MC giảm số lựa chọn vẫn chạy, không crash

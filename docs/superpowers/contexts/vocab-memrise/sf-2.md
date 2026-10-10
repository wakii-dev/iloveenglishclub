# SF-2 Context Pack — Session engine + API (tier 1, depends SF-1)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2). Bracket plan: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md`. Story: VU-37, dest `story-vu37-vocab-memrise`, Phase 1/2.

## Spec slice (SF-2 chịu trách nhiệm)

1. Types thuần (`learn-session.ts`): `SessionKind = 'learn'|'review'`; `StepKind = 'introduce'|'mc'|'listen'|'type'`; `SessionStep = {stepIndex, kind, wordId, word?, ipa?, audioUrl?, options?: string[], meaningVi?}`; `GradeRequest/GradeResult`. KHÔNG bao giờ có cờ đáp án/đáp án chữ MC trong payload trả client.
2. `buildLearnSteps` thuần: input = từ của MỘT level (chunk từ `levels.ts` — SF-1 lib) + progress state + pool distractor (meaning_vi các từ cùng book); rule: queue = từ `reps = 0` (row CÓ THỂ tồn tại từ seed learn-flow — seed ≠ planted); đan xen ~2 từ mới/lượt, THỨ TỰ CUỐI server quyết; MC tối đa 4 lựa chọn (pool <4 nghĩa phân biệt → giảm số lựa chọn, <2 nghĩa phân biệt → bỏ step MC); step `listen` CHỈ khi `audio_url != null` (không có → bỏ step); chuỗi per từ: introduce → mc → listen? → type.
3. `buildReviewSteps` thuần: input = due queue (do store query SQL-side) → per từ: mc (listen-nếu-có-audio HOẶC mc nghĩa) → type; `?word=` prefill = queue 1 từ (tuân cùng XP rules, không vector riêng — rule lần-đầu-trong-ngày của SF-1 tự chặn).
4. `gradeStep` thuần: chấm MC/listen (so meaning) + type (so từ); normalize = trim + lowercase + collapse space (soi `normalizeKey`/`escapeLikeTerm` trong repo để tái dùng style); **typo tolerance: edit distance ≤1 với từ ≥5 ký tự → tính ĐÚNG** (số pin trong tests); hàm CHỈ chấm, không ghi gì.
5. `qualityFromSteps` thuần: MỖI TỪ ĐÚNG MỘT GRADE SM-2/LƯỢT — mọi bước test của từ đúng → q=4; bất kỳ bước sai → q=0; q=0 → `lapses + 1`. Bước test trả correct/incorrect cho client, KHÔNG tự ghi SRS; grade ghi MỘT lần khi từ hoàn thành lượt (learn mới: reps 0→1; review: advance `nextReview` bình thường — engine `src/lib/vocabulary/srs.ts` GIỮ NGUYÊN, chỉ gọi).
6. Store (`learn-session-store.ts`): `getLearnSession(userId, bookId)` → chọn level kế tiếp (rule §2.5 spec: chunk ĐẦU TIÊN theo order còn ≥1 từ `reps=0`; hết → `{ok:true, steps:[]}`), queue SQL-side (JOIN `book_words` order + `user_word_progress`), sinh `sessionKey` UUID; `getReviewSession(userId, {bookId?, wordId?})` → due queue `due_at <= now()` SQL-side trên index `(user_id, due_at)`, limit `DUE_LIMIT` (50), order oldest-due-first. **CẤM load-all pattern** (bài học daily-plan-store 5000 rows); test khẳng định query shape (§6.8 spec).
7. `applyStep(userId, req)` store: validate (session user; `wordId` thuộc scope phiên — book/level client khai lại; check ownership + membership, KHÔNG đòi strict due-ness — cho phép retry sau sai; `stepIndex`/`attemptNo` chỉ phục vụ idempotency) → `gradeStep` → NẾU từ hoàn thành lượt: MỘT transaction ghi (a) SRS grade qua `nextReview` + `lapses` khi q<3 (b) XP award qua `vocab-xp-store` (SF-1) (c) trả `{correct, grade:{quality,ease,intervalDays,reps,dueAt,lapses}, xpAwarded, xpCapped, totalXp, streak, goalDone}`. Duplicate idempotency_key → trả kết quả cached, KHÔNG ghi SRS lần 2.
8. Route `/api/vocabulary/session` (`src/app/api/vocabulary/session/route.ts`): GET `?kind=learn|review&book=&word=`; POST body `{sessionKey, kind, bookId, wordId, stepIndex, attemptNo, stepKind, response}`. Error taxonomy: GET/POST 401 `{ok:false,error:"not-authenticated"}`; 400 `invalidKind|invalidBook|invalidSession|invalidStep|invalidResponse`; 404 `sessionNotFound|wordNotFound`; success-rỗng = 200 `{ok:true, steps:[]}` (không 204). State stateless: `sessionKey` chỉ audit/idempotency, KHÔNG có session table; queue re-derive mỗi GET.
9. Route tests + engine tests: degenerate pool (6 từ prod shape), interleave order, typo table pin, grade map, regression instant-mastery (5 từ all-correct → mỗi từ reps tiến ĐÚNG 1, không 3), duplicate idempotency không ghi SRS lần 2, GET payload không leak đáp án.
10. Fixture owner cho acceptance curl/demo: tái dùng pattern `e2e/vocabulary-learn-fixture.ts` (`ensureLearnWordsFixture`, config 3315) hoặc seed script minimal `qa-*` — KHÔNG tự chế fixture mới khi pattern đã có.
11. Merge về đích + `~/.claude/bin/story-verify` sạch + audit comment.

## Touch map (SF-2 sở hữu)

```
src/lib/vocabulary/learn-session.ts        (mới — pure)
src/lib/vocabulary/learn-session-store.ts  (mới — DB leg)
src/app/api/vocabulary/session/route.ts    (mới)
src/app/api/vocabulary/session/route.test.ts (mới)
+ file test engine tương ứng
```
IMPORT được (SF-1 sở hữu, đọc không sửa): `vocab-xp-store` (transaction award), `levels` (chunk/nextLevel), `growth` (stage cho response nếu cần). Pattern reference (READ-ONLY): `srs.ts` `nextReview`, `review-store.ts` (style mock test), `quiz.ts` `buildQuiz` (degenerate precedent), `study-store.ts` (seed ≠ planted), `submit-attempt.ts` (transaction pattern).
**CẤM đụng** (lane song song SF-4 sở hữu): `src/components/vocabulary/*`, hub page, `hub-status.ts`, mọi file UI. SF-2 là file-mới-only.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. curl GET `?kind=learn&book=<qa-book>` trả step list đúng chuỗi introduce→mc→(listen khi có audio)→type, không có chữ nào là "đáp án đúng"; sách chưa học → level 1; level 1 planted hết → level 2.
2. curl POST đi hết phiên 5 từ all-correct → mỗi từ `reps` tiến đúng 1 (không 3), XP = 4×5 (learn-complete) + số bước đúng ×1 (lần-đầu-trong-ngày), `goalDone` đúng khi đủ goal.
3. Trả lời sai 1 bước → grade q=0, `lapses+1`, `xpAwarded=0`; retry attemptNo mới trả lời đúng → được XP như thường (nếu chưa dùng lần-đầu-trong-ngày của từ đó).
4. Gửi POST trùng `stepIndex+attemptNo` → kết quả cached, `due_at`/XP KHÔNG đổi.
5. GET lại sau "reload" → queue còn lại đúng (đã planted biến mất; từ sai q=0 due 1d → rơi khỏi review queue hiện tại, learn queue còn `reps=0`).
6. Book 6 từ (prod shape): MC giảm số lựa chọn vẫn chạy; không crash.

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG viết component UI/page nào (SF-3), KHÔNG sửa hub/dashboard (SF-4), KHÔNG đụng `src/components/`.
- KHÔNG sửa `srs.ts` engine, KHÔNG đổi schema (SF-1 làm rồi — nếu thiếu cột/lib: FLAG coordination, không tự migration).
- KHÔNG đụng route/flow legacy `/api/vocabulary/review` + `ReviewFlashcards` (SF-3 nghỉ hưu).
- KHÔNG trả đáp án qua payload; KHÔNG lưu session state server (stateless).

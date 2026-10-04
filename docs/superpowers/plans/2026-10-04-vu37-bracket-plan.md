# VU-37 vocab-memrise — bracket plan (SF split + task sketch)

Spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2 — post spec-critic). Dest: `story-vu37-vocab-memrise`. Team: PM coordinator; designer phase MỘT lượt trước launch SF-3 (covers SF-3+SF-4, shared tokens); SF visual-heavy → design-first.

## DAG

```
tier 0: sf-1 (nền tảng XP + schema + libs thuần)
tier 1: sf-2 (session engine + API)   ‖   sf-4 (dashboard home)  ← sf-4 cần design hand-off trước khi launch
tier 2: sf-3 (session UI learn+review) ← sf-2 (+ design hand-off)
tier 3: sf-5 (convergence + QA)        ← sf-1, sf-2, sf-3, sf-4
```
Edges (explicit direct, safe cho orca DAG): sf-2→sf-1 · sf-4→sf-1 · sf-3→sf-2 · sf-5→sf-1 · sf-5→sf-2 · sf-5→sf-3 · sf-5→sf-4.
File-safety lane sf-2 ‖ sf-4: SF-2 CHỈ file mới (engine/store/route/tests) — cấm đụng `src/components/vocabulary/*` + hub page/hub-status; SF-4 sở hữu hub surface.
Phases (relabel post-tiering — checkpoint trung thực): **Phase 1** = sf-1..sf-4 (loop học + ôn + dashboard live) → checkpoint SAU khi tier 2 merge xong; **Phase 2** = sf-5 (convergence) → checkpoint cuối.

## Anti-duplicate check (SF-SCOPE LỚN — đã chạy trước khi chốt)

Mỗi lib/engine/UI chỉ tồn tại ở MỘT SF: XP engine+growth+levels = SF-1 duy nhất (consumed bởi SF-2/SF-4 qua import, không re-implement) · session engine+API = SF-2 duy nhất · runner UI = SF-3 duy nhất · dashboard = SF-4 duy nhất. Pattern i18n keys: mỗi UI SF thêm key cho UI CỦA MÌNH theo convention repo (vocabulary-module precedent) — cố tình KHÔNG gộp vào SF-1 vì key phụ thuộc output designer phase (sau SF-1). Task merge/verify là Zweck mỗi SF (không tính duplicate). Không có cặp SF nào ≥50% tasks cùng loại.

## SF-1 — Nền tảng XP vocab + schema + libs thuần (tier 0, ~11 tasks, design: none)

What demo: migration chạy trên Neon template; `awardVocabXp` transaction cộng XP có anti-farm (regrade không cộng, cap 60/ngày, learn-complete chỉ lần đầu); `growthStage()` + `nextLevel()` trả đúng theo bảng boundary spec §2.4/§2.5.
Tasks: 1) migration additive (vocab_activity, profiles.daily_goal_words, user_word_progress.lapses, daily_activity.vocab_steps) + dry-run template; 2) migration leaderboard view drop/recreate (UNION ALL attempts+vocab, ::int, TZ, cả 2 branch qua profiles); 3) schema.ts exports/types; 4) vocab-xp.ts thuần (rules table, lần-đầu-trong-ngày, cap, idempotency key builder); 5) vocab-xp-store.ts (transaction lock + ON CONFLICT + profiles.xp + daily_activity + streak presence); 6) growth.ts + tests boundary; 7) levels.ts (chunk 10, level kế tiếp, progress, edge 0-từ/hết-level) + tests; 8) daily-goal helper (vnToday) + tests; 9) i18n `learn.json` skeleton (stage names, goal labels) vi/en parity; 10) vitest + integration check view (user vocab-only hiện weekly); 11) merge + story-verify + audit.
ACCEPTANCE (user-visible/kiểm được): SQL query weekly leaderboard trả XP vocab; hàm thuần chạy đúng bảng boundary qua vitest; migration idempotent re-run.

## SF-2 — Session engine + API (tier 1, ~12 tasks, design: none)

What demo: curl GET build phiên learn/review đúng step list (không lộ đáp án); curl POST grade chấm server-side, XP chạy đúng §4, SRS ghi MỘT grade/từ/lượt (không instant-mastery), sai → lapses+1.
Tasks: 1) types SessionKind/Step/GradeResult; 2) buildLearnSteps thuần (queue reps=0 theo level, degenerate distractor, interleave server-owned, listen-step chỉ khi có audio); 3) buildReviewSteps thuần (due SQL-side, prefill 1 từ); 4) gradeStep thuần (MC/listen/type normalize + typo ≤1 với từ ≥5 ký tự) — chấm only; 5) qualityFromSteps (mọi bước đúng q=4 / sai q=0, một grade/từ/lượt); 6) store: getLearnSession/getReviewSession (SQL-side index, sessionKey UUID, scope ?book/?word); 7) store: applyStep (validate scope/ownership → grade → MỘT transaction: SRS grade + vocab-xp + lapses + goalDone); 8) GET+POST route `/api/vocabulary/session` + error taxonomy spec §5; 9) route tests (401/400/404, GET payload không cờ đáp án, steps:[] rỗng); 10) engine tests (degenerate, interleave, typo table, grade map, regression instant-mastery, duplicate idempotency không ghi SRS lần 2); 11) perf assertion SQL-side queue (§6.8, vitest); 12) merge + story-verify + audit.
ACCEPTANCE (fixture owner: tái dùng pattern `e2e/vocabulary-learn-fixture.ts` — `ensureLearnWordsFixture` 3315 — hoặc seed script minimal `qa-*`; SF-2 KHÔNG tự viết fixture mới trừ khi thiếu): curl walkthrough learn 5 từ + review sai→retry; GET lại sau "reload" trả queue còn lại.

## SF-3 — Session UI learn + review (tier 2, ~13 tasks, design: mock-prototype — DESIGN GATE)

What demo (end-to-end): đăng nhập → learn page → đi đủ introduce→MC→nghe→gõ bằng chuột/bàn phím → tổng kết XP; /me/vocabulary review: gõ đúng +1 XP do_at tiến, sai requeue lapses+1; reload giữa phiên không mất.
Tasks: 1) SessionRunner shell (client steps router, requeue client-side, attemptNo); 2) IntroduceCard (audio/IPA/nghĩa/ví dụ + growth chip); 3) McStep; 4) ListenStep (audio control); 5) TypeStep (normalize + typo feedback); 6) per-word grade POST + progress; 7) SessionSummary (XP, xpCapped, planted, next CTA); 8) page `/vocabulary/learn/[book]` (auth redirect); 9) **Nghỉ hưu legacy review surface (exit criteria pinned)**: xoá `ReviewFlashcards` + refactor `quiz-runner.tsx` (đang import review-flashcards — grep `review-flashcards` = 0); xoá route `POST /api/vocabulary/review` + `applyReview` + `listDueWords` (path client-trusted quality KHÔNG được sống sót — quyết định: DELETE); xoá `playwright.vocabulary-review.config.ts` + `review-flow.spec.ts` + lane `test:e2e:vocabulary-review` (3311 retired); giữ contract `href="/me/vocabulary?scope=all"` + prefill `?word=`/`?scope=book&book=`; `tsc` + next build xanh; 10) e2e learn port 3317 (walkthrough + reload + XP summary); 11) e2e review port 3318 (migrate coverage từ 3311 + sai→requeue→retry + double-submit idempotency); 12) i18n keys UI + a11y (keyboard toàn phiên, reduced-motion, touch ≥44) + mobile 375; 13) merge + story-verify + audit.

## SF-4 — Dashboard home Memrise-style (tier 1, ~10 tasks, design: mock-prototype — DESIGN GATE)

What demo (end-to-end): đăng nhập /vi/vocabulary thấy dashboard: continue card đúng level kế tiếp, goal ring đúng planted-hôm-nay/goal, chỉnh goal được, streak/due/XP đúng, garden strip + per-book progress bars, Khám phá hoạt động.
Tasks: 1) dashboard layout theo design hand-off (thay HubOverviewSection, giữ ?tab contract); 2) ContinueCard (levels.ts, state hoàn thành, plain `<Link href>` → `/vocabulary/learn/[book]` — 404 interim pre-SF-3 chấp nhận được); 3) GoalRing + editor inline (presets 5/10/20); 4) stats row streak/due/CTA review/XP; 5) GardenStrip (growth.ts distribution); 6) BookLevelsProgress bars; 7) Khám phá giữ logic vào layout mới; 8) API bổ sung: PATCH goal + dashboard aggregate query (planted-today, growth dist, levels progress) + tests; 9) e2e dashboard port 3319 — **assert continue-card href, KHÔNG navigate vào learn runner** (SF-3 có thể chưa merge); + i18n + a11y/mobile; 10) update hub suite 3314 (hub-overview.spec.ts đang assert H1 "Tổng quan từ vựng" + `dl > div` KPI + tab hrefs — viết lại assertion theo dashboard mới); 11) merge + story-verify + audit.

## SF-5 — Convergence + QA (tier 3, ~10 tasks, design: none)

What demo: toàn vocab suites xanh liên tiếp; leaderboard /top-users hiện XP vocab; 6-từ prod không crash; design fidelity; security-audit sạch P0/P1.
Tasks: 1) back-compat sweep (?tab/?word/?scope/login redirect/guest); 2) /top-users weekly vocab e2e + /me streak ngày vocab-only; 3) full e2e vocab suites (3310, 3312–3319 — 3311 retired — gồm learn-flow 3315) chạy liên tiếp xanh; 4) rehearsal scale (fixture degenerate 6 từ + fixture ~5k rows, query-shape assertions từ SF-2); 5) a11y + mobile 375 walkthrough tổng thể (screenshots); 6) design fidelity so hand-off — checklist token/spacing + screenshot từng màn hình so direction; 7) VU-32 coexistence (enrich song song, learn/review chỉ ghi own tables); 8) security-audit checkpoint (session API, goal PATCH, repo hygiene secrets/exec-bit); 9) docs runbook + evidence pack convergence; 10) final verify + Epic audit comment.

## Launch order & gates

1. APPROVE → epic issue + sub-issues + story worktree (dest fork từ primary).
2. Designer phase dispatch SONG SONG SF-1 (tier 0) — MỘT lượt (SF-3+SF-4 screens + tokens) → user chọn hướng → hand-off file. Design gate CHỈ chặn launch SF-4 và SF-3; SF-1/SF-2 không đợi.
3. Launch tier 0 SF-1 → merge. Tier 1: SF-2 ‖ SF-4 (SF-4 chỉ sau design gate) — **SF-3 launch khi SF-2 merged (+ design gate), KHÔNG đợi SF-4** (SF-4 merge lane độc lập). Sau tier 2 merge xong → **Phase 1 checkpoint** → tier 3 SF-5 → final verify → PR.

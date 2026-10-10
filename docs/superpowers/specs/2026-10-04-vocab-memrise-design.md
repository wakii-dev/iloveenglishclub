# Vocabulary Memrise-like — epic spec v2 (VU-37)

Ngày: 2026-10-04 · Story: VU-37 · dest: `story-vu37-vocab-memrise` · Base: master @ c8aa3d1 (đã gồm vocabulary-module + vocabulary-hub + learn-flow PR#6 + oxford-crawl PR#7)
v2: áp spec-critic 2026-10-04 — pin queue semantics, grade granularity, idempotency, session state, GET payload, typo tolerance, growth table, view migration.

## 0. IDEA-BRIEF (8 chiều)

- **Task** — "làm /en/vocabulary giống memrise" = thay trải nghiệm học từ thụ động (seed → flashcard tự chấm) bằng **learning loop chủ động kiểu Memrise**: học từ mới theo phiên đan xen giới-thiệu→trắc-nghiệm→nghe-chọn→gõ-từ, ôn tập có bước gõ từ, mọi hoạt động được tính XP/streak vào hệ điểm chung, dashboard cá nhân hoá kiểu Memrise.
- **Output** — các page/flow trong web app ILEC hiện có: `/[locale]/vocabulary` (dashboard home mới), phiên học (learn session) và phiên ôn (review session) mới, leaderboard `/top-users` tính cả XP vocab.
- **Users** — học viên tiếng Anh Việt Nam (chuẩn bị Cambridge Prepare / IELTS), free, chủ yếu mobile web, đăng nhập Google/Credentials.
- **Constraints** — MUST: giữ URL contract (`/vocabulary?tab=`, `/me/vocabulary?word=&scope=&book=`), e2e suite 3310–3316 + learn-flow xanh, không đụng `words` (VU-32 crawl đang enrich song song), XP cùng thang dictation, i18n vi/en parity. MUST-NOT: không phá nền dictation, không trả đáp án (chữ đáp án MC, cờ correct) qua payload client.
- **Input** — Memrise làm tham chiếu UX (research 2026-10-04, không Figma); code nền đã có; quyết định user: **Lõi thu gọn**.
- **Context** — SRS SM-2-lite + `user_word_progress` đã sống; learn-flow (5 từ/ngày staggered seed) mới merge; gamification dictation (xp/streak/daily_activity/leaderboard view) đã có; prod ~6 từ (crawl bơm dần).
- **Success criteria** (binary, nghiệm thu theo SF acceptance): (1) học viên đăng nhập `/vi/vocabulary` thấy dashboard Memrise-style, bấm continue học từ mới qua chuỗi giới-thiệu→MC→nghe→gõ, xong phiên nhận XP, streak/goal cập nhật; (2) ôn tập có bước gõ từ chấm server-side, sai 0 XP, `due_at` tiến đúng SM-2; (3) XP vocab hiện trong `/top-users` weekly + all_time; (4) mọi e2e suite hiện có còn xanh.
- **Out-of-scope** — Speed Review, Difficult Words, mems, AI (MemBot/examiner), community courses, native video, email/push, quiz XP, đổi engine SRS sang fixed ladder.

## 1. P0 impact — tóm tắt (full: dispatch phase0-impact-analyst 2026-10-04)

**Touch map chính** — modify: hub `page.tsx` + `hub-overview-section`, `review-store`/`review route` legacy, `schema.ts`, `messages/{en,vi}/vocabulary.json`, `hub-status.ts`; create: `learn-session.ts` + `learn-session-store.ts` + `growth.ts` + `levels.ts` + `vocab-xp.ts` (+ tests từng file), `/api/vocabulary/session` route + test, session runner components, dashboard components, e2e suite mới port 3317/3318/3319.

**Quyết định kiến trúc (chốt từ P0 alternatives + user answers + spec-critic):**
| Chọn | Lý do |
|---|---|
| (a) A1 — rebuild tab overview thành dashboard, giữ `?tab=library|review|quiz` | Memrise-feel đúng chỗ, blast URL/e2e nhỏ |
| (b) B1 — engine session MỚI (pure ⋈ store), không nhét vào ReviewFlashcards | session = server-graded ordered steps, khác contract self-graded flip; giữ pure/DB split convention |
| (c) C1 — giữ SM-2-lite, ánh xạ growth stage từ `reps`/`intervalDays` | 0 migration dữ liệu, ease thích nghi; stage delivering garden metaphor |
| (e) E2 — bảng `vocab_activity` source-of-truth XP vocab + write-through `profiles.xp` + **migrate weekly leaderboard view UNION ALL cả vocab_activity** | giữ invariant "xp là cache"; hết divergence weekly/all_time |

**Second-order đáng nhớ:** server-side grading theo pattern `submit-attempt.ts` (FOR UPDATE + idempotency) nếu không XP farm; MC pool degenerate (<4 distractor, prod 6 từ) mirror `buildQuiz`; learn/review queue select SQL-side trên index `(user_id, due_at)` + `book_words(book_id, order)` — cấm load-all pattern 5000-rows; listening step degrade khi `audio_url` null; a11y: typing label/focus, `prefers-reduced-motion`, touch ≥44px.

## 2. UX flows (khung cứng — visual do designer phase, CREATIVITY BALANCED)

### 2.1 Learn session (từ mới)
- Vào từ dashboard continue-card hoặc trang sách: chọn sách → **level kế tiếp** (định nghĩa §2.5) → build phiên.
- **Queue learn = các từ của level với `reps = 0`** (row progress CÓ THỂ tồn tại sẵn từ seed learn-flow `seedBookProgress` — seed ≠ planted); `reps ≥ 1` = đã planted, không quay lại learn queue.
- Chuỗi bước kiểu Memrise, server quyết thứ tự cuối cùng, đan xen ~2 từ mới/lượt: **giới thiệu** (card: từ + audio nếu có + IPA + nghĩa VI + ví dụ) → **MC chọn nghĩa** (tối đa 4 lựa chọn; pool <4 → giảm số lựa chọn, ≥2 nghĩa phân biệt mới sinh MC) → **nghe-chọn** (CHỈ khi từ có `audio_url`; không có → bỏ step này) → **gõ từ** (prompt = nghĩa VI; nhập lại từ tiếng Anh).
- **Grade SM-2: MỖI TỪ ĐÚNG MỘT LẦN/LƯỢT** — quality suy từ kết quả các bước test của từ trong lượt: mọi bước đúng → q=4; bất kỳ bước sai → q=0. Bước test chỉ chấm (trả correct/incorrect), KHÔNG tự ghi SRS; grade duy nhất ghi khi từ hoàn thành lượt (reps 0→1 với learn mới, hoặc advance bình thường với review).
- Từ sai (q=0): client requeue trong phiên (attempt sau), SRS vẫn ghi q=0 (reps→0, interval 1d) — attempt retry là instance mới (§4).
- Pool degenerate: sách 0 từ hoặc level hết từ chưa-planted → GET trả `{ok:true, steps:[]}`; MC không đủ distractor → giảm lựa chọn; KHÔNG crash với 6 từ prod.
- Tổng kết phiên: XP nhận (kể cả `xpCapped`), từ planted, stage, next level.

### 2.2 Review session (ôn tập — classic review có gõ từ)
- **Queue review = từ `due_at <= now()`** SQL-side (index `(user_id, due_at)`, limit `DUE_LIMIT`), scope `?book=` như cũ.
- Bước per từ: MC nghe-chọn (nếu có audio) hoặc MC nghĩa → **gõ từ** (prompt = nghĩa VI).
- **Một grade SM-2 per từ per lượt** như §2.1 (mọi bước đúng → q=4; sai bước nào → q=0); q=0 → `lapses + 1`.
- `/me/vocabulary` render phiên review mới (giữ `?word=` prefill 1 từ — prefill tuân cùng XP rules §4, không vector riêng; `?scope=book&book=`). `ReviewFlashcards` bị thay thế — xoá component + e2e cũ, migrate coverage sang suite mới (port 3318).

### 2.3 Dashboard home (tab overview — mặc định khi đăng nhập)
- **Continue card**: sách + level kế tiếp (đúng rule §2.5 — dùng chung lib `levels.ts`, KHÔNG tự derive); sách hoàn thành → trạng thái "hoàn thành".
- **Goal ring hôm nay**: từ mới planted hôm nay / `profiles.daily_goal_words` (default 5); day boundary = `vnToday`/`ILEC_TZ` (`Asia/Ho_Chi_Minh`) — tái dùng `src/lib/gamification/streak.ts`.
- **Chỉnh goal**: inline trên dashboard (popover/menu tại goal ring) — SF dashboard sở hữu UI, presets 5/10/20.
- **Streak** (presence của `daily_activity` hôm nay — ngày học vocab HOẶC dictation đều giữ), **due count** + CTA start review, **garden strip** (phân bố từ theo growth stage — lib `growth.ts`), **per-book levels progress bars** (`levels.ts`), **Khám phá** (giữ nguyên logic learn-flow).

### 2.4 Growth stage (garden metaphor) — bảng boundary cứng
Map theo `intervalDays` sau grade (SM-2 thật: 1d/6d/~15d/~37d/~93d/~232d):
| Stage | Tên VI | Điều kiện |
|---|---|---|
| 0 | Hạt mầm | `reps = 0` (chưa planted — gồm mọi từ seed) |
| 1 | Nảy mầm | planted, `intervalDays < 2` |
| 2 | Cây con | `< 7` |
| 3 | Nụ | `< 14` |
| 4 | Cây non | `< 45` |
| 5 | Cây xanh | `< 100` |
| 6 | Trỗi dậy | `< 200` |
| 7 | Nở hoa | `≥ 200` |
`growth.ts` thuần, icon + label i18n, tooltip "ôn lại lúc …". Chip "mastered" hiện có (`MASTERED_REPS=3`, library) giữ nguyên — hai khái niệm song song (mastered = reps, stage = interval).

### 2.5 Level (chunk sách) — định nghĩa cứng
- Level = chunk **10 từ** (constant `WORDS_PER_LEVEL = 10`) theo `book_words.order` tăng dần; tính thuần trong `levels.ts`, không schema.
- **Level kế tiếp của (user, book) = chunk ĐẦU TIÊN (theo order) còn chứa ≥1 từ `reps = 0`**; continue = chunk đó (không skip). Mọi chunk planted hết → hết level (GET trả steps rỗng; continue card "hoàn thành sách").
- Progress bar level = planted / tổng từ chunk; progress sách = planted / tổng từ sách.

## 3. Data model (migration trên Neon)

| Thay đổi | Chi tiết |
|---|---|
| Bảng `vocab_activity` | `id`, `user_id FK profiles cascade`, `word_id FK words cascade`, `kind text` (`'learn-complete'｜'session-step'`), `correct boolean`, `xp int`, `session_key text`, `step_index int`, `attempt_no int`, `idempotency_key text UNIQUE`, `created_at timestamptz default now()`; index `(user_id, created_at)` + `(user_id, word_id)`. Ghi MỌI event chấm (kể cả sai, xp=0) — audit completeness + phục vụ check lần-đầu-trong-ngày |
| `profiles.daily_goal_words` | `int NOT NULL default 5` |
| `user_word_progress.lapses` | `int NOT NULL default 0` (+1 khi grade q<3) |
| `daily_activity.vocab_steps` | `int NOT NULL default 0` (chốt cột này — không dùng "presence-only"); **heatmap `/me` giữ dictation-only, không đổi `getMyStats`** (streak dùng presence row, không dùng partsDone) |
| Leaderboard view migration | **drop/recreate** `leaderboard`: weekly = `UNION ALL` 2 branch (attempts.xp và vocab_activity.xp), CẢ HAI join qua `profiles` (user chỉ học vocab vẫn hiện), `SUM(...)::int`, cùng TZ bucket ISO tuần `Asia/Ho_Chi_Minh`; all_time giữ `profiles.xp` |
| KHÔNG đụng | `words` (VU-32 enrich fill-empty-only), `book_words`, `crawl_entries`, `quiz_attempts` |

## 4. XP rules (khung cứng — SF pin số trong tests)

- Thang tham chiếu dictation 10 XP/part. Vocab: **learn-complete ≈ 4 XP**, **bước test đúng ≈ 1 XP** (ở CẢ learn và review).
- **Điều kiện XP** = chấm server-side đúng; bỏ khái niệm "tiến stage" làm điều kiện. Chặn lặp:
  1. `idempotency_key = ${userId}:${sessionKey}:${wordId}:${stepIndex}:${attemptNo}` (server derive — client không gửi key) → duplicate submit trả kết quả cached, **KHÔNG ghi SRS lần 2**.
  2. **Lần-đầu-trong-ngày**: 1 XP/bước chỉ lần chấm ĐÚNG đầu tiên của (user, word) trong ngày VN — check tồn tại row `vocab_activity (user, word, correct=true, hôm nay)` trong transaction (chặn farm qua regrade/attemptNo mới/prefill URL).
  3. learn-complete 4 XP chỉ lần **`reps` đầu tiên vượt 0** — check chưa tồn tại `kind='learn-complete'` cho (user, word).
- **Cap 60 XP/ngày từ vocab** (count trong transaction, mirror `todayCount` pattern): sau cap SRS vẫn tiến đầy đủ, `xpAwarded=0`, response flag `xpCapped: true`.
- Sai → `vocab_activity` row `correct=false, xp=0` (audit), không XP, `lapses+1` ở grade.
- Ghi MỘT transaction: lock + insert activity (ON CONFLICT DO NOTHING theo idempotency_key) + cộng `profiles.xp` + upsert `daily_activity` (`vocab_steps +1`) + grade SRS — pattern `submit-attempt.ts`.
- Quiz KHÔNG XP.

## 5. API contract — `/api/vocabulary/session` (shape `{ok:false,error:…}` hiện có)

- **`GET ?kind=learn&book=<id>`** → phiên learn level kế tiếp (rule §2.5). **`GET ?kind=review[&book=][&word=]`** → phiên review due-queue (`?word=` = queue 1 từ prefill).
- **GET success payload**: `{ok:true, sessionKey, kind, bookId, steps:[…]}` — TOÀN BỘ step list theo thứ tự SERVER quyết. Step: `{stepIndex, kind:'introduce'｜'mc'｜'listen'｜'type', wordId, word?, ipa?, audioUrl?, options?[], meaningVi?, attemptNo?}`. `meaningVi` CÓ ở step gõ-từ (là PROMPT) và ở card giới-thiệu; **KHÔNG bao giờ** trả cờ đáp án/đáp án chữ MC. Interleave order server-owned; client chỉ render theo `stepIndex`.
- **GET errors**: 401 `not-authenticated`; 400 `invalidKind`/`invalidBook`; success-rỗng = 200 `{ok:true, steps:[]}` (không 204).
- **POST** `{sessionKey, kind, bookId, wordId, stepIndex, attemptNo, stepKind, response}` → server chấm → `{ok:true, correct, grade:{quality,ease,intervalDays,reps,dueAt,lapses}, xpAwarded, xpCapped, totalXp, streak, goalDone}`. **POST validate**: session user; `wordId` thuộc **scope phiên** (book/level client khai lại — check ownership + membership, KHÔNG đòi strict due-ness để cho phép retry sau sai); `stepIndex`/`attemptNo` chỉ dùng cho idempotency key. Errors: 401; 400 `invalidSession/invalidStep/invalidResponse`; 404 `sessionNotFound` (sessionKey+user không có activity nào và scope không hợp lệ), `wordNotFound`.
- **Stateless**: `sessionKey` = UUID server sinh ở GET, CHỈ dùng cho audit/idempotency — **không có session state phía server**; queue re-derive mỗi lần cần; requeue sau sai = client-side ordering; reload trang = GET lại, hàng mới = từ còn thỏa điều kiện queue (review: còn due; learn: còn `reps=0` chưa planted trong level).
- Auth: session.user.id; mọi query scope user_id; không route public mới.

## 6. Acceptance (browser/e2e — trừ mục ghi rõ)

1. Đăng nhập `/vi/vocabulary` → dashboard: continue card, goal ring, streak, due count, garden strip, per-book progress — **thấy bằng mắt** (screenshot), không chỉ DOM.
2. Learn session 5 từ: đủ chuỗi introduce→MC→nghe(→bỏ khi không audio)→gõ; sai bước nào từ đó q=0 + requeue trong phiên; grade MỖI TỪ ĐÚNG 1 LẦN (reps tiến đúng 1/lượt — không instant-mastery); tổng kết XP đúng §4; reload giữa phiên GET lại không mất từ còn lại.
3. Review session: từ due đúng (SQL-side); gõ đúng lần-đầu-trong-ngày → +1 XP, due_at tiến SM-2; gõ sai → requeue + `lapses+1` + 0 XP; typo ≤1 với từ ≥5 ký tự tính ĐÚNG (số pin trong tests); done screen đúng.
4. `/top-users` weekly CỘNG cả XP vocab (view migration); all_time khớp `profiles.xp`; user chỉ học vocab (0 attempt dictation) vẫn hiện weekly.
5. `/me/vocabulary?word=<id>` prefill chạy; `?tab=library|quiz` nguyên trạng; guests → login redirect như cũ; regrade cùng bước (idempotency) không cộng XP, không ghi SRS lần 2.
6. 6 từ prod (pool <4) không crash; sách hoàn thành → continue card "hoàn thành" + GET steps rỗng.
7. i18n vi/en parity (`src/messages.test.ts`); a11y: keyboard đi được cả phiên, `prefers-reduced-motion`, touch ≥44px; mobile 375 usable.
8. *(vitest/integration — không phải browser)* 64k-scale: session queue query SQL-side trên index `(user_id, due_at)`/`book_words(book_id, order)`; test khẳng định không load-all pattern.

## 7. Boundary (KHÔNG làm)

Speed Review · Difficult Words · mems · AI chat/examiner · community/user courses · native video · notification email/push · quiz XP · fixed-ladder SRS · đổi `words` schema · đụng admin crawl (VU-32) · heatmap `/me` đổi semantics.

## 8. Testing & release

- Vitest thuần: `learn-session`, `learn-session-store`, `growth` (bảng boundary §2.4), `levels` (rule §2.5), `vocab-xp` (bảng XP + anti-farm rules) + route test + typo-tolerance pin; mock `@/db` theo `review-store.test.ts`.
- E2e Playwright: **port 3317** learn-session, **3318** review-upgrade (migrate từ 3311), **3319** dashboard (hub 3314 update song song); workers:1, fixture `qa-*`, globalSetup idempotent; giữ xanh: vocabulary 3310/3312/3313/3314/3316 + learn-flow.
- Phased release (relabel post-tiering): **Phase 1** = SF-1..SF-4 (loop học + ôn + dashboard) → checkpoint SAU khi tier 2 merge xong (build + suite + security-audit sạch P0/P1); **Phase 2** = SF-5 (convergence) → checkpoint cuối.
- Design-first: SF-3 + SF-4 visual-heavy → `design: mock-prototype`; MỘT designer phase trước launch SF-3 (shared tokens + screens cho cả session UI và dashboard), hand-off `docs/superpowers/designs/vocab-memrise-direction.md`; SF-2 (engine) không đợi design.

## 9. Rủi ro (P0 → đã xử trong spec v2)

1. **HIGH** server-side grading (§4/§5 pin idempotency + transaction pattern) · 2. **HIGH** weekly leaderboard divergence (§3 view migration UNION ALL) · 3. **MED** pool nhỏ (§2.1 degenerate + e2e fixture 6 từ) · 4. **MED** 64k queue scale (§6.8 SQL-side) · 5. **MED** VU-32 concurrent (chỉ ghi `user_word_progress` + own tables; đọc `words` read-only) · 6. LOW i18n parity / port / migration dry-run Neon template.

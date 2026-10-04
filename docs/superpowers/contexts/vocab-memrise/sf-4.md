# SF-4 Context Pack — Dashboard home Memrise-style (tier 1, depends SF-1 · DESIGN: mock-prototype)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2). Bracket plan: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md`. Story: VU-37, dest `story-vu37-vocab-memrise`, Phase 1/2 (SF-4 chạy SONG SONG lane SF-2 — file-safety: chỉ đụng hub surface).
> **DESIGN GATE:** SF có `design: mock-prototype` — implement theo hand-off `docs/superpowers/designs/vocab-memrise-direction.md`. Chưa có hand-off → DỪNG, báo coordinator.

## Spec slice (SF-4 chịu trách nhiệm)

1. Dashboard layout: thay nội dung tab overview (`HubOverviewSection`) bằng dashboard Memrise-style theo hand-off; giữ tab strip + contract `?tab=` (guest vẫn default library qua `resolveHubTab` — KHÔNG đổi); guest hitting overview → login redirect như cũ.
2. `ContinueCard`: sách + level kế tiếp — DÙNG lib `levels.ts` (SF-1: `nextLevel` = chunk đầu theo order còn ≥1 từ `reps=0`); sách hoàn thành → state "hoàn thành sách"; render plain `<Link href>` → `/vocabulary/learn/[book]` (route của SF-3 — 404 interim CHẤP NHẬN được, không tự tạo route).
3. `GoalRing`: planted-hôm-nay / `profiles.daily_goal_words`; day boundary `vnToday`/`ILEC_TZ` (tái dùng `src/lib/gamification/streak.ts`); planted-today đếm từ `vocab_activity` (`kind='learn-complete'` hôm nay) — cột/table của SF-1.
4. Goal editor inline: popover/menu tại goal ring, presets 5/10/20 → PATCH lưu `profiles.daily_goal_words` (route/API SF-4 tự làm — mục 8).
5. Stats row: streak (presence `daily_activity` hôm nay — học vocab HOẶC dictation đều giữ), due count (tái dùng `getHubStats`), CTA start review → `/me/vocabulary?scope=all` (contract cũ), tổng XP (`profiles.xp`).
6. `GardenStrip`: phân bố từ theo growth stage qua lib `growth.ts` SF-1 (query COUNT group theo boundary — SQL-side, không load-all).
7. `BookLevelsProgress`: per-book level progress bars (planted/tổng per level + per book) từ `levels.ts` + 1 query aggregate SQL-side (JOIN `book_words` order + `user_word_progress`).
8. API bổ sung (SF-4 sở hữu): `PATCH/POST /api/vocabulary/goal` (body `{goal}` validate ∈ {5,10,20} — hoặc free 1..100, chốt 1 cách) trả `{ok, dailyGoalWords}`; 401/400 taxonomy hiện có. Dashboard aggregate: query RSC trực tiếp (server component) — KHÔNG cần route GET mới trừ khi hand-off đòi client fetch.
9. e2e dashboard port **3319** (config mới, fixture `qa-*`, workers:1): assert các khối dashboard hiện đúng số liệu với fixture seeded; **assert continue-card href — KHÔNG navigate vào learn runner** (SF-3 có thể chưa merge). + i18n keys dashboard (vi/en parity) + a11y (contrast, aria cho ring/progress, keyboard) + mobile 375.
10. Update hub suite **3314** (`hub-overview.spec.ts` đang assert H1 "Tổng quan từ vựng", `dl > div` KPI cards, tab hrefs — viết lại assertion theo dashboard mới; giữ phần còn đúng).
11. Merge về đích + `~/.claude/bin/story-verify` sạch + audit comment.

## Touch map (SF-4 sở hữu)

```
src/components/vocabulary/hub-overview-section.tsx   (sửa nặng — thành dashboard)
src/components/vocabulary/dashboard-*.tsx            (mới — continue-card, goal-ring, garden-strip, book-levels-progress…)
src/app/api/vocabulary/goal/route.ts (+ test)        (mới)
src/lib/vocabulary/dashboard-store.ts (nếu tách query) (mới)
e2e/dashboard.spec.ts + playwright.vocabulary-dashboard.config.ts + fixture (mới, port 3319)
e2e/hub-overview.spec.ts                              (sửa — assertion mới)
messages/{en,vi}/vocabulary.json                      (sửa — keys dashboard)
```
READ-ONLY: `levels`/`growth`/`vocab-xp*` (SF-1 import), page `vocabulary/page.tsx` dispatcher (chỉ sửa phần render overview nếu cần — KHÔNG đổi tab logic), `hub-tabs` (giữ nguyên), learn route (SF-3 sở hữu — chỉ link), `learn-session*` (SF-2 sở hữu).

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Đăng nhập `/vi/vocabulary` (tab mặc định): THẤY dashboard — continue card tên sách + level đúng (không phải level đã planted hết), goal ring đúng tỉ số planted-hôm-nay/goal, streak, due count, tổng XP — đối chiếu với DB fixture khớp số.
2. Bấm chỉnh goal 5→10 → reload trang giữ 10; ring cập nhật mốc.
3. Garden strip hiển thị phân bố stage đúng với progress fixture; mỗi book có progress bar đúng % planted.
4. Sách planted hết → continue card chuyển "hoàn thành" (không bấm được vào level rỗng).
5. Guest mở /vi/vocabulary → vẫn rơi vào library + login redirect cho tab cá nhân như cũ (không regression).
6. Mobile 375: dashboard cuộn dùng được; a11y: ring/progress có text alternative.

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG đụng session engine/API (SF-2), UI phiên học (SF-3), lib XP/growth/levels (SF-1 — chỉ import).
- KHÔNG đổi `resolveHubTab`/tab contract; KHÔNG đổi `/me/vocabulary` (SF-3 sở hữu); KHÔNG tự tạo route learn (SF-3).
- KHÔNG đổi schema (thiếu gì → flag SF-1/coordinator); KHÔNG đổi Speed Review/Difficult Words (out of scope story).
- KHÔNG seed prod; KHÔNG giữ widget cũ không có trong hand-off (Khám phá giữ logic, hình hài theo design mới).

# SF-3 Context Pack — Trang /today UI + nav + reminder + i18n + e2e (design-first)
> Đọc file này THAY VÌ tự tổng hợp từ story .wakii + epic + comments. Epic spec: `docs/superpowers/specs/2026-10-13-daily-journey-design.md` (v2). Story .wakii: `docs/superpowers/mindmaps/daily-journey.wakii`. SF-1 (libs+migration+listen_ms) + SF-2 (`getTodaySnapshot` + `/api/today/goal` + unify label) đã merge.

## ⚠️ DESIGN GATE TRƯỚC DEV (sf node `design: mock-prototype`)
KHÔNG code UI trước khi có hand-off. Designer phase (PM điều phối, huashu-design/mock-prototype): **3 hướng HTML** theo sections dưới + brand tokens hiện có (xem `dashboard-goal-ring`, hub cards làm reference token) → USER CHỌN (gate bắt buộc) → hand-off `docs/superpowers/designs/daily-journey-direction.md` (tokens/structure/behavior). Prompt cho designer: mock hoàn toàn từ snapshot shape spec §3.2 + section list dưới — KHÔNG cần đợi SF-2 merge. Chỉ PHASE BUILD mới cần SF-2.

## Spec slice (chỉ phần SF-3 chịu trách nhiệm)
1. **Page** `src/app/(public)/[locale]/today/page.tsx`: RSC `force-dynamic`, auth-gated guest → `redirect(/${locale}/login?next=/${locale}/today)` (pattern `me/page.tsx:27-33`); `setRequestLocale(locale)` đầu tiên; `generateMetadata`; MỘT `h1`; namespace `today`. Render từ `getTodaySnapshot` (SF-2) — KHÔNG query trực tiếp trong page.
2. **Sections theo spec §2.1** (components `src/components/today/`):
   - `TodayHero`: 2 ring (phút / từ — pattern `dashboard-goal-ring`: donut, `role="img"`, aria-label tỉ số, `stroke-dasharray` + `motion-safe:` transitions) + trạng thái "hoàn thành cả 2" tĩnh reduced-motion-safe. Chú thích "phút ước tính từ audio" khi bài hiện tại thiếu duration.
   - **Goal editors**: preset phút 5/15/30 + từ 5/10/20 + free input (phút 5..120, từ 1..100); phút → `PATCH /api/today/goal`, từ → `/api/vocabulary/goal` CŨ; xong `router.refresh()` (pattern `dashboard-goal-ring.tsx:50-52`).
   - `TodaySuggestionCards`: dictation next (title + doneParts/totalParts + CTA deep-link `/books/{bookSlug}/units/{unit}/lessons/{n}/listen-and-type`; mọi sách xong → trạng thái hoàn thành) · vocab due (N từ + CTA `/me/vocabulary?scope=all`) · vocab continue (level kế tiếp + CTA `/vocabulary/learn/[bookId]`; hết → "hoàn thành sách"). Thứ tự ưu tiên theo remaining goal.
   - `TodayQuestList`: đúng 3 quest từ snapshot — progress bar, trạng thái done TỰ ĐỘNG (KHÔNG nút claim), `newlyCompletedQuests` → toast sonner đúng 1 lần.
   - `TodayBadgeStrip`: badge đã nhận + locked với mốc kế tiếp gần nhất; `newlyEarnedBadges` → toast 1 lần.
   - `TodayStreakCard`: số streak (snapshot.streak — LIVE) + shield read-only: credits/cap; Phase 1 KHÔNG có freeze rows → KHÔNG hiển thị "được bảo vệ" (chỉ mô tả cơ chế credit trung tính — chưa hiệu lực tới SF-4).
3. **Nav + reminder (spec §2.6)**: header `header.tsx` thêm link "Hôm nay" (`nav.today`) cả desktop + mobile; `TodayNavDot` client-island trong link — dot khi authenticated AND goalDone.both=false. Nguồn: `readMyStats()` mở rộng `{xp, streak, goalDone}` (`src/lib/actions/my-stats.ts` +goalDone — 2 count query nhỏ từ daily_activity×vocab_activity VN-day); refresh qua event `ilec:stats-updated`. **THÊM dispatch `notifyStatsUpdated()` vào `session-runner.tsx` sau mỗi POST grade thành công** (hiện chỉ dictation-lesson dispatch — không thì dot stale sau hoạt động vocab). Guest: không dot, link vẫn dẫn /today.
4. **i18n**: `messages/{en,vi}/today.json` MỚI (namespace auto-merge loader) — đủ: page title/h1, hero, goal editors, suggestion cards, quest list, badge strip, streak/shield card, toasts + **tên/mô tả 7 quest + 13 badge** theo key convention SF-1: `quests.<questId>.{title,desc}`, `badges.<badgeId>.{title,desc}`; `messages/{en,vi}/common.json` + `nav.today`. Parity test `src/messages.test.ts` xanh.
5. **a11y/mobile**: keyboard đi hết page (tab order), focus-visible, aria states (quest done aria-live nhẹ), `prefers-reduced-motion` (motion-safe: variants), touch ≥44px, 375px usable — screenshots.
6. **E2e port 3321** (3320 ĐÃ DÙNG oxford-crawl — verified): `playwright.today.config.ts` (pattern `playwright.vocabulary-dashboard.config.ts` — workers:1, fixture, globalSetup idempotent, precompile nếu cần); fixture `e2e/today-fixture.ts` + globalSetup seed `qa-today-*` (pattern `vocabulary-dashboard-fixture.ts` + ensureX helpers). **Quest-hash pin mechanism (pinned, chống flaky)**: selection đổi theo (userId, date) → globalSetup runtime SEARCH user-id: lặp `qa-today-<n>` gọi `selectQuests(id, vnToday())` (lib SF-1) tới khi set chứa `q-review-5` → seed user ĐÓ. Specs: `today-page.spec.ts` (guest redirect, hero rings đúng seeded, 3 suggestion card đúng, vi/en, a11y smoke), `today-quest.spec.ts` (hoạt động vocab thật → quest auto-done + reload không lặp + badge quests-5 đúng 1 lần — fixture seed 4 completions trước + toast đúng 1 lần), dot tắt sau goal kép (qua event dispatch — không reload).

## Touch map (files SF-3 tạo/sở hữu)
```
src/app/(public)/[locale]/today/page.tsx        CREATE
src/components/today/*.tsx (hero, goal editors, suggestion cards, quest list, badge strip, streak card, nav-dot)  CREATE
messages/{en,vi}/today.json                     CREATE
playwright.today.config.ts                      CREATE
e2e/today-fixture.ts + today-global-setup.ts (+teardown)  CREATE
e2e/today-page.spec.ts + today-quest.spec.ts    CREATE
src/components/layout/header.tsx                MODIFY (nav link + dot)
src/components/layout/user-menu.tsx             MODIFY (nếu dot ghé trong menu mobile)
src/lib/actions/my-stats.ts                     MODIFY (+goalDone)
src/components/vocabulary/session-runner.tsx    MODIFY (+dispatch event sau POST)
messages/{en,vi}/common.json                    MODIFY (nav.today)
package.json                                    MODIFY (script test:e2e:today)
```
READ-ONLY: `today-store.ts` + `/api/today/goal` (SF-2 — gọi, không sửa; bug = flag), pure libs SF-1, `submit-attempt.ts`/`vocab-xp-store.ts` (SF-4), `dashboard-store.ts`, `/me` pages (SF-4), e2e configs khác (ports).

## ACCEPTANCE (user-visible / nghiệm thu)
- Đăng nhập `/vi/today` + `/en/today`: hero goal kép ĐÚNG số liệu thật seeded (so tay), 3 suggestion card đúng (dictation next đúng bài chưa done theo thứ tự; due khớp; continue khớp dashboard vocab) — thấy bằng MẮT (screenshot BEFORE/AFTER), không chỉ DOM.
- Nghe 1 part → quay lại /today: ring phút tăng đúng; quest liên quan progress tăng.
- Ôn 5 từ đúng (nếu q-review-5 trong set user QA — fixture pin) → quest done tự động + toast 1 lần; reload → KHÔNG toast lại, KHÔNG record lại.
- Đạt goal kép → dot nav TẮT ngay (event dispatch, không full reload); PATCH goal phút 15 → ring + editor phản ánh, reload giữ.
- Guest `/vi/today` → login redirect giữ `next`; guest nav không dot.
- i18n vi/en parity xanh; mobile 375 screenshot usable; keyboard đi hết; reduced-motionrespect.
- Suite 3321 xanh; các suite e2e hiện có KHÔNG regression (chạy lại dashboard 3319 + vocabulary chính).

## Boundary (KHÔNG làm)
- KHÔNG sửa store/API logic SF-2 (gọi thôi; bug → flag coordinator, không tự patch).
- KHÔNG consume shield / hiển thị "được bảo vệ" (SF-4 — Phase 1 chưa có freeze rows).
- KHÔNG đụng `/me` pages/components gamification (SF-4).
- KHÔNG đổi `submit-attempt.ts`/`vocab-xp-store.ts`/streak wiring (SF-4).
- KHÔNG thêm nguồn XP, KHÔNG claim button, KHÔNG banner/toast reminder ngoài nav-dot.
- Sau merge SF-3: **security-audit checkpoint Phase-1** (scope: goal route + auto-record tx + snapshot scoping) — PM điều phối, sạch P0/P1 mới launch SF-4.

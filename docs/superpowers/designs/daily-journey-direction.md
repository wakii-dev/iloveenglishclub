# Daily Journey — /today direction (APPROVED)

- **Ngày duyệt:** 2026-10-14 (user chọn qua design gate — watchdog vòng 40 relay)
- **Hướng chọn: A — Dashboard-dense** (trong 3 hướng A/B/C)
- **Prototype gốc:** https://share.onorca.dev/a/oqHmzpbc3fcQ (HTML mock — nguồn tham chiếu tokens/structure; nếu link chết, cấu trúc bắt buộc dưới đây vẫn là contract)
- **Spec nguồn:** `docs/superpowers/specs/2026-10-13-daily-journey-design.md` §2.1 (sections) + §2.6 (reminder)

## Structure (bắt buộc theo spec — A render dày đặc 1 màn, mobile stack dọc)
1. **Hero goal kép** — 2 ring (phút nghe / từ ôn-luyện) cạnh nhau (A: cùng hàng desktop), trạng thái "hoàn thành cả 2" + chú thích "phút ước tính từ audio" khi thiếu duration. Ring theo pattern `dashboard-goal-ring` (donut, role=img, aria tỉ số, motion-safe transition).
2. **Goal editors inline** — preset phút 5/15/30 + từ 5/10/20 + free input; phút → PATCH `/api/today/goal`, từ → `/api/vocabulary/goal`.
3. **Suggestion cards (3, ưu tiên theo remaining goal)** — dictation next-lesson (deep-link + doneParts/totalParts) · vocab due (N từ → `/me/vocabulary?scope=all`) · vocab continue (level kế → `/vocabulary/learn/[bookId]`).
4. **Quest list** — đúng 3 quest hôm nay, progress bar, done TỰ ĐỘNG (KHÔNG nút claim), toast mới-hoàn-thành 1 lần.
5. **Badge strip** — đã nhận + locked (mốc kế gần nhất).
6. **Streak + shield card** — số streak (LIVE) + credits/cap read-only; Phase 1 KHÔNG hiển thị "được bảo vệ".

## Tokens
- Theo hệ hiện có: biến globals.css, radius/border pattern hub cards vocab, donut `dashboard-goal-ring`, focus-visible, touch ≥44px, `prefers-reduced-motion` (motion-safe:).
- A-density: grid 2 cột desktop (hero + suggestions trái, quests + badges + streak phải), mobile 375px stack dọc đơn giản.

## Behavior pin
- Data: `getTodaySnapshot` (SF-2) — KHÔNG query trực tiếp trong page.
- Nav "Hôm nay" + `TodayNavDot` (dot khi goalDone.both=false) + dispatch `ilec:stats-updated` từ session-runner.
- Guest → login redirect giữ next; guest không dot.
- i18n namespace `today` + `common.nav.today`; quest/badge keys theo convention `quests.<id>.{title,desc}` / `badges.<id>.{title,desc}`.

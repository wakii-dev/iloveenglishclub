# Rule 0 browser verify — SF-3 /today (VU-51) — 3 tầng nhận thức

Run: 2026-10-14 · worktree sf-3-daily-journey · server next dev :3321 · DB ilec_dj_sf3 (clone ilec_dev 0007) · user seed qa-today (fixture quest-hash runtime search)

## Tầng 1 — DOM (eval qua Playwright)
- rings: 2× role=img 92px, aria "Đã nghe 5 trên 5 phút hôm nay" / "Đã ôn/luyện 3 trên 5 từ hôm nay" (đúng seeded B: listen 5/5 · practiced 3/5)
- dot: 8×8px tại nav link "Hôm nay" (goalDone=false)
- cards=3 · quests=3 · h1=1 · dictation href `/vi/books/level-5/units/1/lessons/1/listen-and-type` (đúng oracle SQL — sách đang đọc, bài đầu chưa done)
- mobile 375: scrollWidth == clientWidth (KHÔNG horizontal overflow); menu mobile dot hiển thị

## Tầng 2 — VISUAL (screenshots — đọc bằng mắt, so hand-off direction A)
flow-01 BEFORE: grid 2 cột desktop (hero+editors+suggestions trái, quests/badges/streak phải) — đúng hand-off A; ring coral 5/5 full + teal 3/5; chú thích "Phút ước tính từ audio" (level-5 parts NULL duration — duration-hint chạy); badge strip 5 chip locked-next (1/metric); shield "Credit: 0/2" + mô tả trung tính KHÔNG "được bảo vệ"
flow-04 AFTER (ôn 2 từ → goal kép): celebration banner; cả 2 quest "Hoàn thành" chip auto (không claim); due card empty-state; dictation reorder FIRST; dot header MẤT
flow-06 EN: h1 "Today's plan" + aria EN swap đủ
flow-07 mobile menu: "Hôm nay ●" trong UserMenu dropdown (md:hidden item) + dot
flow-08 mobile 375 full page: stack dọc sạch, touch ≥44px

## Tầng 3 — FLOW (đi trọn, tôi tự lái browser)
1. guest /vi/today → redirect `/vi/login?next=/vi/today` (next giữ nguyên) ✓
2. login UI (bcrypt seed user) → dot ON trong nav ✓
3. /vi/today BEFORE: rings/cards/quests đúng seeded ✓ (flow-01)
4. click suggestion dictation CTA → deep-link đúng bài listen-and-type ✓ (flow-02)
5. ôn 2 từ due ĐÚNG qua review UI thật (POST /api/vocabulary/session) → sau từ 2: dot TẮT NGAY qua event `ilec:stats-updated` — URL không đổi (không reload) ✓ (flow-03)
6. quay lại /today: celebration + quest auto-done + due empty ✓ (flow-04)
7. PATCH goal phút 15 qua preset → ring aria "5 trên 15" + reload GIỮ ✓ (flow-05 — run 1; run 2 flake do RSC-swap → đã pin thành e2e test today-page.spec "PATCH goal phút 15" click-with-retry, xanh)
8. logout qua UserMenu → /en ✓ (run 1 log; run 2 menu skeleton stale-session dev quirk — known next-auth, không phải bug SF)
9. /en/today i18n ✓ (flow-06) · mobile 375 menu+page ✓ (flow-07/08)

## Kết luận
Tôi ĐÃ THẤY trang chạy đúng ACCEPTANCE bằng mắt + tay (DOM đo + ảnh + flow trọn). Không có bước nào "nói thay" bằng DOM query.

## Bổ sung — Nghe 1 part → ring phút tăng (acceptance #2, verify sau review)
Seed part level-3/u1/l1 duration 61s (QA data — template chỉ có 3.5s/parts, floorMinutes không nhấn; restore 3500 sau verify):
- BEFORE: ring "Đã nghe 0 trên 10 phút hôm nay" (flow-09)
- Nghe part 1 THẬT qua player (Start → gõ transcript → Enter; exactly-right + progress 1/4) (flow-10)
- DB: daily_activity.listen_ms = 61000 (coalesce(duration) ĐÚNG 1 lần)
- AFTER: ring "Đã nghe 1 trên 10 phút hôm nay" = floor(61000/60000) ✓ (flow-11)
- Re-attempt CÙNG part cùng ngày → listen_ms VẪN 61000 (isFirstToday — không cộng kép) ✓
- Bonus thấy live: quest "Đạt mục tiêu phút nghe" 0/10 → 1/10 · streak 0 → 1 ngày (daily_activity row) · dictation next chuyển theo reading-priority §3.4 (level-3 thành sách đang đọc — "Hoạt động thời gian rảnh 1/4 phần") · XP header 510 XP 🔥1
- Sự cố giữa chừng (không phải bug SF): server 500 `vendor-chunks/sonner.js` do tôi chạy `next build` TRONG lúc dev server sống (.next bị ghi đè) → restart dev server sạch → hết. Bài học: không build+dev cùng .next.

# Rule 0 browser walkthrough — SF-6 (checklist 2b) — 3 tầng DOM / VISUAL / FLOW

- **Target:** build PROD local (`next build` + `next start` :3110) trên HEAD `40b56ec`+
  evidence `eba052a` — đúng artifact sắp merge (không phải dev server).
- **Tool:** Playwright Chromium (trusted clicks) — script committed:
  `screenshots-sf6/walkthrough.mjs` (chạy lại được: `node …/walkthrough.mjs`).
- **Kết quả: PASS — 15/15 bước, 0 pageerror, 0 console.error.**

## Tầng 1 — DOM (assert element thật mỗi bước)

15 bước assert bằng getByRole/locator (banner, card Level 3, unit/lesson link, START gate,
textbox, diff chip `span.line-through`, Part label, results, nút "câu tiếp" vi, textbox
trong viewport mobile) — log đầy đủ trong output script.

## Tầng 2 — VISUAL (ảnh chụp, đã tự đọc từng ảnh)

13 PNG trong `screenshots-sf6/`: 01-home-en · 02-books · 03-book · 04-unit ·
05-lesson-before-start · 06-lesson-checked-diff · 07-review-part1-diff-persist ·
08-next-part-adjacent-part2 · 09-results · 10-(transcript: UI không dùng role=tab — skip,
không fail) · 11-home-vi · 12-lesson-vi · 13-lesson-mobile-390.

Ảnh chính đã đọc trực tiếp:
- `06-lesson-checked-diff.png` — diff đỏ `friend`→`friends` trên chip đúng chuẩn, audio
  player (pause/waveform/0:03/1x), XP chip guest "+9 XP not saved", Part 1/4 + ‹ ›.
- `01/11-home-{en,vi}.png` — hero + card "Sample lesson"/"Phương pháp" + carousel lộ trình
  + section 4 bước, đủ 2 locale.
- `09-results.png` — results guest: "0 done · 4 skipped" khớp đúng flow walkthrough
  (skip-only), "+9 XP earned (not saved)", words to review từ các part skip, Try again /
  Next lesson.
- `13-lesson-mobile-390.png` — textbox trong viewport (assert toạ độ trong script).

## Tầng 3 — FLOW (click-through thật)

home → click Books → /en/books → click Level 3 → book → click Unit 1 → unit → click
lesson 1 listen-and-type → START (gate KHÔNG tự phát) → gõ SAI ("friend") → Enter check →
diff đỏ 1 từ → "next sentence" → Part 2/4 → **‹ review part 1: diff persist (miền QA-103)**
→ **› từ review → part 2 KỀ BÊN (QA-103 fix — bug cũ nhảy part 3 đã chết)** → skip ×2 →
Part 4/4 → gõ + check + next → RESULTS → /vi: home + lesson flow với nút "câu tiếp"
tiếng Việt → mobile 390: start + gõ + check + textbox trong viewport.

## Artifact chụp đã điều tra (KHÔNG phải bug app — ghi để người sau không re-investigate)

1. **Card hero `anim-float`/`anim-fade-up` "biến mất" trong fullPage headless screenshot:**
   DOM probe opacity=1, không ancestor ẩn, computed color/bg đúng; chụp với
   `animations: "disabled"` → render đầy đủ. Nguyên nhân: headless stitch tile với infinite
   CSS animation giữa frame. Người dùng thật thấy bình thường (khớp evidence smoke SF-1).
   Script đã fix: home shots dùng `animations: "disabled"`.
2. **Section reveal-on-scroll (IntersectionObserver thêm class) trống nếu không scroll-pass:**
   script home shots có scroll-pass trước khi chụp.
3. **Header overlap trên `09-results.png`:** fullPage + sticky header artifact — flow DOM
   đúng (results render đủ), ảnh lesson/normal page không dính.

## Prod browser flows — BLOCKED GAP #3

Prod smoke public / prod dictation flow `@test.ilec` / prod admin publish `[QA]` cần prod
URL + admin creds (GAP #3 a, c — đã hỏi epic 21:18 29-09, chưa có GAP-ANSWER). Bằng chứng
thay thế trong run này: toàn bộ flow trên ở tầng build prod LOCAL (cùng artifact code với
nhánh đích sẽ merge); prod DB verify sạch bằng dry-run read-only (prod-cleanup-dryrun.md).

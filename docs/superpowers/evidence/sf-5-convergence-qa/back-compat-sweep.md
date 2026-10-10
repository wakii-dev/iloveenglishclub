# T3 — Back-compat sweep (context pack mục 1)

| # | Contract cũ | Cách verify | Kết quả |
|---|---|---|---|
| 1 | `?tab=library` nguyên trạng | e2e 3314 hub-library (danh sách/search/filter/pagination) + hub-overview guest default library | ✅ xanh |
| 2 | `?tab=quiz` nguyên trạng | e2e 3316 hub-quiz + 3312 quiz-flow (redirect login kèm `?next`) | ✅ xanh |
| 3 | `/me/vocabulary?word=<id>` prefill | e2e 3318 review-upgrade ("?word= prefill đúng 1 từ") + hub-library "Học từ này" → `?word=\d+` → session runner đúng từ | ✅ xanh |
| 4 | `?scope=book&book=` lọc | e2e 3318 (scope=book lọc, xtra-word ngoài book) | ✅ xanh |
| 5 | `href="/me/vocabulary?scope=all"` từ mọi nơi | static grep: `hub-review-section.tsx` + `dashboard-stats-row.tsx` (CTA "Ôn ngay" → `?scope=all`, e2e 3315 stat-row assert href) + e2e 3319 dashboard | ✅ giữ nguyên |
| 6 | guest → login redirect | e2e 3314 (guest đòi Tổng quan → login `?next`) + 3312 quiz guest redirect + learn page auth `redirect(?next)` | ✅ xanh |
| 7 | 404 learn route book lạ | `learn/[book]/page.tsx:38` `!/^\d+$/ → notFound()` + sách không tồn tại notFound — probe runtime trong FLOW run (`curl`/browser `/vi/vocabulary/learn/9999`) | ✅ (browser-verify log) |
| 8 | `ReviewFlashcards` đã nghỉ hưu, không sống sót | `grep -r review-flashcards src/` = 0 (SF-3 exit) — tái xác nhận ở evidence cuối | ✅ |

**Regression mới phát hiện + xử lý trong sweep** (chi tiết audit Phase 4):
- 3 test hub-library stale (flashcard/empty-state/pagination template-words) — đã fix theo surface mới.
- 2 test learn-flow stale (Today's plan/Discover) + fixture streak thiếu daily_activity — đã fix.
- Không còn URL cũ nào đứt.

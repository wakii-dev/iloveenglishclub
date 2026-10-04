# SF-5 Context Pack — Convergence + QA (tier 3, depends SF-1/SF-2/SF-3/SF-4)

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-10-04-vocab-memrise-design.md` (v2). Bracket plan: `docs/superpowers/plans/2026-10-04-vu37-bracket-plan.md`. Story: VU-37, dest `story-vu37-vocab-memrise`, Phase 2/2 — checkpoint cuối story. SF-5 = QA phase riêng (Tester độc lập với Dev): tìm lỗi, KHÔNG mở scope code mới (fix nhỏ thuộc SF gốc khi có thể — fix lớn escalate).

## Spec slice (SF-5 chịu trách nhiệm)

1. Back-compat sweep trên dest: `?tab=library|quiz` nguyên trạng; `/me/vocabulary?word=<id>` prefill; `?scope=book&book=`; `href="/me/vocabulary?scope=all"` từ mọi nơi; guest → login redirect; 404 learn route khi book lạ.
2. Leaderboard e2e: `/top-users` weekly CỘNG XP vocab (user vocab-only 0 dictation vẫn hiện — view migration SF-1); all_time khớp `profiles.xp`; `/me`: streak giữ khi ngày chỉ học vocab (presence `daily_activity`).
3. Full e2e vocab liên tiếp xanh: 3310, 3312, 3313, 3314, 3315 (learn-flow), 3316, 3317 (learn-session), 3318 (review-upgrade), 3319 (dashboard) — 3311 RETIRED (lane xoá ở SF-3; xác nhận lane biến mất khỏi package.json).
4. Rehearsal scale: fixture degenerate 6 từ (prod shape) walkthrough không crash; fixture ~5k rows (script seed `qa-*` temporary, teardown sạch) — session build + dashboard aggregate không timeout, query-shape assertions SF-2 (§6.8 spec) vẫn pass.
5. a11y + mobile walkthrough tổng thể: keyboard toàn phiên học + review + dashboard; `prefers-reduced-motion`; touch ≥44px; screenshots 375px từng màn hình (BEFORE/AFTER evidence).
6. Design fidelity so hand-off `docs/superpowers/designs/vocab-memrise-direction.md`: checklist token/spacing/màu + screenshot từng màn hình so direction — chênh lệch ghi rõ (dev-fix nhỏ trực tiếp, lệch hướng → escalate).
7. VU-32 coexistence: chạy enrich dry-run (không apply) song song flow học — `words` chỉ READ (learn/review/lookup không ghi `words`); xác nhận `source='oxford-ld'`/`cefr` không bị flow vocab ghi đè.
8. Security-audit checkpoint Phase (OWASP surface mới + repo hygiene): `/api/vocabulary/session` (grading server-side? idempotency? user scoping? injection qua `response`?), `/api/vocabulary/goal` (auth? validate?), secrets/.env trong diff, exec-bit mới, permissions, lockfile-deps. Phase không checkpoint nếu còn P0/P1.
9. Docs: runbook ngắn (`docs/superpowers/evidence/vocab-memrise/convergence/runbook.md`) — migration đã áp gì, env cần gì (không env mới kỳ vọng), feature map URL mới/cũ; evidence pack convergence (screenshots + suites + audit).
10. Final verify trên dest + Epic audit comment (SF→merge-hash map + hướng dẫn merge cho người) — STORY-COMPLETE checklist theo skill (PR do coordinator).

## Touch map (SF-5 sở hữu)

```
docs/superpowers/evidence/vocab-memrise/convergence/**  (mới — evidence + runbook)
e2e/top-users-vocab.spec.ts (nếu cần suite riêng — port mới 3320)  (mới, tuỳ)
scripts/rehearsal-vocab-5k.ts (temporary seed rehearsal — xoá sau khi chạy, teardown sạch)
fix nhỏ trong file của SF-1..SF-4 (sửa trực tiếp khi là bug rõ; sửa lớn → report)
```
READ-ONLY toàn bộ phần còn lại — SF-5 là tester: phát hiện bug → fix nhỏ thuộc surface đó làm trực tiếp + ghi audit; tính năng mới/mở scope → KHÔNG, report.

## ACCEPTANCE (user-visible — verifier Phase 5 kiểm)

1. Click-through thật: đăng nhập → dashboard → learn 5 từ → nhận XP → /top-users THẤY tên mình tăng điểm weekly; sang ngày (mock TZ hoặc seed) review đúng hàng đợi.
2. Tất cả URL cũ hoạt động đúng (danh sách mục 1) — không regression nào sót.
3. Một lệnh chạy cả bộ vocab suites xanh liên tiếp (evidence log); 3311 đã biến mất khỏi lanes.
4. Rehearsal 6 từ + 5k từ: phiên build < vài trăm ms, không seq-scan toàn bảng (assertions SF-2 pass), không crash.
5. Screenshots 375 từng màn hình đạt: keyboard-only đi được, reduced-motion tắt animation, contrast OK.
6. Design fidelity: mỗi màn có screenshot + checklist đối chiếu hand-off, chênh lệch còn lại được liệt kê + phán ánh (fix/escalate).
7. Security-audit: không P0/P1 còn mở; secrets/permission sạch.
8. Epic audit comment đầy đủ SF→merge-hash + PR ready (dest pushed).

## Boundary (KHÔNG làm — đụng tới = flag, không code)

- KHÔNG thêm tính năng mới; KHÔNG đổi spec/acceptance; KHÔNG merge PR (cửa người).
- KHÔNG sửa engine/design theo ý riêng — bug rõ fix nhỏ, còn lại report coordinator.
- KHÔNG đụng VU-32 admin crawl (chỉ dry-run verify); KHÔNG seed/hít prod data.
- KHÔNG xoá evidence/documented decisions; rollback-fixer chỉ khi diverge thật.

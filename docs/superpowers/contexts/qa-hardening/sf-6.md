# SF-6 Context Pack — Prod QA + convergence

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: `docs/superpowers/specs/2026-09-29-qa-hardening-design.md` (§5 prod safety, §6 AC, §5.6 convergence protocol). Plan: `docs/superpowers/plans/2026-09-29-qa-hardening-plan.md` (SF-6 — 13 tasks, task 0 bootstrap ĐỨNG ĐẦU).

## Dispatch constants

- **DB:** DB `ilec` (main — mọi DB sf{2..5} có thể đã dọn; migrate idempotent task 0) · **Worktree:** fork từ HEAD nhánh đích (SAU khi SF-1 merge — precondition flag)
- **Registry:** `findings-sf6.md`, ID **QA-500+** · merge 1 lần về `findings.md` (task 10)
- **Prod (GAP #3 — REQUIREMENT-GAP nếu user chưa trả lời):** (a) URL prod production hay preview; (b) Vercel watch branch nào; (c) admin creds prod; (d) Blob token prod (cleanup pha b). Chưa có → comment GAP lên epic, làm trước phần KHÔNG-blocked (task 5 lighthouse-final-local, task 9 sweep, task 10-12 reports).

## Spec slice (chỉ phần SF-6 chịu trách nhiệm)

1. **Task 0 bootstrap:** `.env.local` worktree + precondition `grep -q "report-only" scripts/lighthouse.mjs` (fail → merge SF-1 task 8 vào đích trước) + `npm run db:migrate` DB `ilec` (idempotent).
2. Deploy strategy: chốt với owner (prod theo branch đích — xác nhận khi GAP #3 resolved); KHÔNG tự merge story branch vào master (quyền người).
3. Prod smoke public: /en /vi, sitemap, robots, canonical domain THẬT (không localhost).
4. Prod dictation flow thật: account `@test.ilec` (vd `sf6-…@test.ilec`), học 1 bài, attempt thật, thấy XP/streak ở /me prod.
5. Prod admin flow thật: tạo + publish lesson `[QA]` trên prod CMS → bài hiện trên site prod + sitemap.
6. **Lighthouse final LOCAL (P0-1):** `next start` trên HEAD nhánh đích + `LH_OUT_DIR=…/qa-hardening/lighthouse node scripts/lighthouse.mjs final` → binary 7/7 PASS (a11y ≥0.95, perf ≥0.85 — hard gate local); đây là gate TRƯỚC khi đo prod.
7. Lighthouse PROD: cùng protocol (median/3, mobile throttled) trên prod URL; **report-only mode — CHỈ perf được nới; a11y ≥0.95 vẫn hard cả prod**; mọi mức sụt so local → root-cause trong report (TTFB/CDN/network là nguyên nhân hợp lệ).
8. Prod security postcheck: headers (HSTS/CSP nếu có), cookies Secure/HttpOnly/SameSite, env không leak (không secret trong client bundle), admin route edge qua domain thật.
9. Prod cleanup 2 PHA (dry-run TRƯỚC khi chạy thật, script committed): (a) DB theo thứ tự FK — `attempts` → `progress` → `daily_activity` → `parts` → `lessons` → `units` → `users @test.ilec` (+ xp rollback nếu leaderboards dùng profiles.xp); (b) Vercel Blob list/delete path prefix `[QA]` (audio publish lúc QA = orphan nếu chỉ xoá DB).
10. Regression sweep final — KHÔNG phụ thuộc prod: lane list = unit + rls + audit + 2 baseline configs + 4 sf configs, TẤT CẢ trên DB `ilec` (template migrated+seeded mới nhất); exit: toàn xanh + số test ≥ baseline (AC#1); chạy trên HEAD nhánh đích lúc CLOSE (protocol §5.6; checklist re-run sau merge vào Recommendations).
11. Registry close: merge findings-sf{1..6} → findings.md; 0 OPEN; DEFERRED có rationale + sign-off; BY-DESIGN re-review.
12. Recommendation report: Next 16 + drizzle-kit upgrade; CI thêm lane e2e/rls (cần Postgres service); checklist re-run sau merge; thiết bị thật/IME (ngoài khả năng agent); default branch GitHub nên về master khi ổn định.
13. Final report + evidence + sign-off gates (AC §6 1-8 từng cái binary).

## Touch map (files SF-6 tạo/sở hữu)

```
docs/superpowers/evidence/qa-hardening/findings.md      # merge tổng
docs/superpowers/evidence/qa-hardening/{lighthouse/,qa-final-report.md}
scripts/qa-prod-cleanup.mjs (hoặc tương tự)             # cleanup 2 pha — dry-run mặc định
```
READ-ONLY: mọi product code (fix mới chỉ khi sweep cuối tìm ra bug — sẽ ghi findings-sf6 + fix surgical + re-run matrix), evidence VU-15.

## ACCEPTANCE (user-visible)

- Prod URL thật: học được 1 bài, admin publish được bài mới, Lighthouse đo được cả local (PASS hard) lẫn prod (a11y PASS, perf report có root-cause).
- Không để lại rác: data test prod đã dọn (DB + Blob), hoặc liệt kê rõ cái còn.
- `findings.md` tổng: 0 OPEN — mọi thứ tìm thấy trong story đã FIXED/BY-DESIGN/DEFERRED-có-signoff.
- Final report đủ để người merges tự tin: gates số thật, evidence trỏ commit, recommendations rõ.

## Boundary (KHÔNG làm)

- KHÔNG merge story branch vào master / KHÔNG merge PR (human gate — agent chỉ tạo PR `--base master` theo directive user).
- KHÔNG chạy cleanup prod khi chưa dry-run + review (xoá DB prod là thao tác nguy hiểm nhất story).
- KHÔNG tự đoán prod URL/creds — GAP #3 protocol.
- KHÔNG refact product code trừ bug sweep cuối buộc (surgical + re-run matrix).

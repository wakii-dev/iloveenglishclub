# SF-6 Prod QA + convergence — run plan (VU-31)

Nguồn tasks: docs/superpowers/plans/2026-09-29-qa-hardening-plan.md §SF-6 (13 tasks)
+ context pack qa-hardening/sf-6.md. File này = run-plan của executor SF-6 (tên chứa
"sf-6" cho gate story-verify B2). Trạng thái chạy thật 29-09 → 30-09.

- [x] 0. bootstrap — .env.local worktree (sau QA-502: localhost ilec, KHÔNG Neon
      prod) + precondition `grep -q "report-only" scripts/lighthouse.mjs` PASS + db:migrate
- [x] 1. deploy-strategy-gap3 — REQUIREMENT-GAP #3 post epic VU-24 21:18 29-09 (4 câu
      a-d); GAP-ANSWER partial (prod DB Neon live — coordinator 21:04); phần chưa trả
      lời → BLOCKED đúng protocol, làm phần non-blocked trước
- [x] 5. lighthouse-final-local — 7/7 PASS hard (perf 90-94, a11y 98-100, ≥ baseline
      SF-8) trên HEAD 40b56ec build prod :3110 — lighthouse-final.md
- [x] 9. regression-sweep-final — 9 lane: unit 267 · rls 18 · audit 15 · admin 46 ·
      sf3 26 · sf4 46 · sf5 43 GREEN; dict-baseline + sf2 flake class QA-506 triaged
      DEFERRED (escape-hatch AC#1) — sweep-final.md
- [x] 8. prod-cleanup-two-phase — script committed (dry-run mặc định) + prod DB
      dry-run: 0 test data; pha b SKIP thiếu token (GAP #3d) — prod-cleanup-dryrun.md
- [x] 10. registry-close-merge — findings.md merged 17 FIXED · 7 BY-DESIGN ·
      7 DEFERRED · 0 OPEN; QA-7 (sf1) cập nhật FIXED
- [x] 11. recommendation-report — qa-recommendations.md (Next 16, drizzle-kit, CI
      lanes, checklist re-run sau merge, thiết bị thật, QA-504/506 hướng xử lý)
- [x] 12. final-report-evidence — qa-final-report.md (ACCEPTANCE từng dòng + AC §6
      1-8 binary) + evidence chain + screenshots-sf6 (Rule 0 3 tầng 15 bước)
- BLOCKED (GAP #3 — không phải bỏ việc; gỡ ngay khi user trả lời 4 câu trên epic):
  2. prod-smoke-public · 3. prod-dictation-flow · 4. prod-admin-flow ·
  6. prod-lighthouse-report-only · 7. prod-security-postcheck ·
  8b. prod cleanup --execute pha b (Blob) — lệnh + điều kiện: qa-final-report.md §4

Fix trong run: QA-7 (9716d6f) · QA-503 (c9ed6c0) · QA-501 (40b56ec) ·
QA-505 (8c80401) · QA-502 (ops coordinator). Reviewer độc lập: verdict trước merge.

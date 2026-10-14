# VU-48 SF-4 convergence run — 2026-10-14 22:18:15
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [22:18:15] sf3 ...
  PASS sf3 (26 passed)
— [22:20:05] sf4 ...
  PASS sf4 (46 passed)
— [22:24:04] today ...
  PASS today (11 passed)
— [22:25:26] vocabulary ...
  PASS vocabulary (2 passed)
— [22:25:39] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [22:26:05] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [22:26:21] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [22:27:00] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [22:27:32] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [22:28:03] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [22:28:43] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [22:30:53] vocabulary-review-upgrade ...
  **FAIL vocabulary-review-upgrade** — log /tmp/sweep-sf4/vocabulary-review-upgrade.log (tail):
    > 225 |     await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
          |                                                        ^
      226 |     await expect(page.getByTestId("xp-chip")).toHaveText("+1 XP");
      227 |     await page.waitForTimeout(600); // nếu có graded trễ → chip đã phải +2
      228 |     await expect(page.getByTestId("xp-chip")).toHaveText("+1 XP");
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/review-upgrade.spec.ts:225:56

    Error Context: test-results/review-upgrade-Review-sess-9f2de-ng-cộng-2-lần-DB-1-row-bước-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/review-upgrade-Review-sess-9f2de-ng-cộng-2-lần-DB-1-row-bước-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/review-upgrade-Review-sess-9f2de-ng-cộng-2-lần-DB-1-row-bước-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/review-upgrade.spec.ts:198:7 › Review session UI (vocab-memrise SF-3) › double-submit cùng bước → chỉ 1 POST, chip không cộng 2 lần, DB 1 row/bước 
  4 passed (1.6m)

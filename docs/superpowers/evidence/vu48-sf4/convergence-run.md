# VU-48 SF-4 convergence run — 2026-10-15 03:52:25
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [03:52:26] sf3 ...
  PASS sf3 (26 passed)
— [03:54:14] sf4 ...
  PASS sf4 (46 passed)
— [03:58:13] today ...
  PASS today (11 passed)
— [03:59:33] vocabulary ...
  PASS vocabulary (2 passed)
— [03:59:45] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [04:00:10] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [04:00:23] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [04:01:02] vocabulary-hub-quiz ...
  **FAIL vocabulary-hub-quiz** — log /tmp/sweep-sf4/vocabulary-hub-quiz.log (tail):
    > 103 |     ).toBeVisible();
          |       ^
      104 |     await expect(page.getByText(/You got \d+\/\d+ correct/)).toBeVisible();
      105 |
      106 |     // điểm đã persist (scope all → quiz_attempts.book_id NULL) → top-users
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:103:7

    Error Context: test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/hub-quiz.spec.ts:79:7 › Vocabulary hub quiz (SF-3) › EN: picker mặc định Tất cả → trả lời đủ → tổng kết % → điểm lên top-users 
  3 passed (41.1s)

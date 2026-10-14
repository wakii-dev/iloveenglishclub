# VU-48 SF-4 convergence run — 2026-10-15 04:12:04
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [04:12:05] sf3 ...
  PASS sf3 (26 passed)
— [04:13:52] sf4 ...
  PASS sf4 (46 passed)
— [04:17:49] today ...
  PASS today (11 passed)
— [04:19:11] vocabulary ...
  PASS vocabulary (2 passed)
— [04:19:24] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [04:19:50] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [04:20:03] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [04:20:42] vocabulary-hub-quiz ...
  **FAIL vocabulary-hub-quiz** — log /tmp/sweep-sf4/vocabulary-hub-quiz.log (tail):
      65 |     await expect(async () => {
      66 |       if (await results.isVisible().catch(() => false)) return;
      67 |       const now = await page
        at advance (/Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:64:58)
        at answerCurrent (/Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:85:11)
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:121:11

    Error Context: test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/hub-quiz.spec.ts:101:7 › Vocabulary hub quiz (SF-3) › EN: picker mặc định Tất cả → trả lời đủ → tổng kết % → điểm lên top-users 
  3 passed (2.4m)

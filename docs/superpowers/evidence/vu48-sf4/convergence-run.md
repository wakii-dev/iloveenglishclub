# VU-48 SF-4 convergence run — 2026-10-15 06:47:13
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [06:47:13] sf3 ...
  PASS sf3 (26 passed)
— [06:49:12] sf4 ...
  PASS sf4 (46 passed)
— [06:53:22] today ...
  PASS today (11 passed)
— [06:54:41] vocabulary ...
  PASS vocabulary (2 passed)
— [06:54:53] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [06:55:18] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [06:55:32] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [06:56:11] vocabulary-hub-quiz ...
  **FAIL vocabulary-hub-quiz** — log /tmp/sweep-sf4/vocabulary-hub-quiz.log (tail):
      67 |     await expect(async () => {
      68 |       if (await results.isVisible().catch(() => false)) return;
      69 |       const now = await page.locator("main").innerText();
        at advance (/Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:66:8)
        at answerCurrent (/Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:86:11)
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-quiz.spec.ts:122:11

    Error Context: test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/hub-quiz-Vocabulary-hub-qu-cbfcf-ng-kết-→-điểm-lên-top-users-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/hub-quiz.spec.ts:102:7 › Vocabulary hub quiz (SF-3) › EN: picker mặc định Tất cả → trả lời đủ → tổng kết % → điểm lên top-users 
  3 passed (39.2s)

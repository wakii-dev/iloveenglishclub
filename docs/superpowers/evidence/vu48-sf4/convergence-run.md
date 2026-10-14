# VU-48 SF-4 convergence run — 2026-10-14 22:02:17
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [22:02:17] sf3 ...
  PASS sf3 (26 passed)
— [22:04:12] sf4 ...
  PASS sf4 (46 passed)
— [22:08:11] today ...
  PASS today (11 passed)
— [22:09:29] vocabulary ...
  PASS vocabulary (2 passed)
— [22:09:42] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [22:10:07] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [22:10:20] vocabulary-hub ...
  **FAIL vocabulary-hub** — log /tmp/sweep-sf4/vocabulary-hub.log (tail):
      124 |       /\/vi\/vocabulary\/learn\/level-\d/,
      125 |     );
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/hub-overview.spec.ts:122:31

    Error Context: test-results/hub-overview-Vocabulary-hu-78616-iếng-Việt-—-navbar-tab-khối-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/hub-overview-Vocabulary-hu-78616-iếng-Việt-—-navbar-tab-khối-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/hub-overview-Vocabulary-hu-78616-iếng-Việt-—-navbar-tab-khối-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  4 failed
    [chromium] › e2e/hub-library.spec.ts:54:7 › Vocabulary hub library (SF-2) › EN: danh sách + Học từ này prefill phiên review 
    [chromium] › e2e/hub-library.spec.ts:98:7 › Vocabulary hub library (SF-2) › EN: search + filter audio/book hoạt động 
    [chromium] › e2e/hub-overview.spec.ts:36:7 › Vocabulary hub — tab Tổng quan dashboard (SF-4) › EN: dashboard khối + tab hrefs giữ nguyên (?tab= contract) 
    [chromium] › e2e/hub-overview.spec.ts:82:7 › Vocabulary hub — tab Tổng quan dashboard (SF-4) › VI: nhãn i18n dashboard tiếng Việt — navbar/tab/khối 
  3 passed (54.2s)

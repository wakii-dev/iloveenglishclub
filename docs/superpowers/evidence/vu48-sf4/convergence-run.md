# VU-48 SF-4 convergence run — 2026-10-15 08:34:12
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [08:34:12] sf3 ...
  PASS sf3 (26 passed)
— [08:36:03] sf4 ...
  PASS sf4 (46 passed)
— [08:39:59] today ...
  PASS today (11 passed)
— [08:41:17] vocabulary ...
  PASS vocabulary (2 passed)
— [08:41:29] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [08:41:55] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [08:42:08] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [08:42:49] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [08:43:21] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [08:43:52] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [08:44:31] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [08:46:41] vocabulary-review-upgrade ...
  PASS vocabulary-review-upgrade (5 passed)
— [08:48:17] top-users-vocab ...
  **FAIL top-users-vocab** — log /tmp/sweep-sf4/top-users-vocab.log (tail):
    > 59 |     await expect(row).toHaveCount(1);
         |                       ^
      60 |     await expect(row).toContainText(dbXp.toLocaleString("vi-VN"));
      61 |   });
      62 |
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/top-users-vocab.spec.ts:59:23

    Error Context: test-results/top-users-vocab-Top-users--18cd8-e-khớp-profiles-xp-của-user-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/top-users-vocab-Top-users--18cd8-e-khớp-profiles-xp-của-user-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/top-users-vocab-Top-users--18cd8-e-khớp-profiles-xp-của-user-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/top-users-vocab.spec.ts:47:7 › Top-users vocab XP (SF-5) › all_time khớp profiles.xp của user 
  2 passed (28.4s)

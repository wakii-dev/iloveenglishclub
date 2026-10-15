# VU-48 SF-4 convergence run — 2026-10-15 10:46:57
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [10:46:58] sf3 ...
  PASS sf3 (26 passed)
— [10:48:53] sf4 ...
  PASS sf4 (46 passed)
— [10:52:53] today ...
  PASS today (11 passed)
— [10:54:14] vocabulary ...
  PASS vocabulary (2 passed)
— [10:54:26] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [10:54:54] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [10:55:07] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [10:55:46] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [10:56:19] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [10:56:51] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [10:57:28] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [10:59:39] vocabulary-review-upgrade ...
  PASS vocabulary-review-upgrade (5 passed)
— [11:01:16] top-users-vocab ...
  PASS top-users-vocab (3 passed)
— [11:01:40] dictation ...
  PASS dictation (114 passed)
— [11:06:25] oxford ...
  PASS oxford (7 passed)
— [11:07:08] oxford-fullchain ...
  **FAIL oxford-fullchain** — log /tmp/sweep-sf4/oxford-fullchain.log (tail):
      102 |     await expect(page.getByText("Có audio phát âm")).toBeVisible();
      103 |
      104 |     // meaning VI bắt buộc (teacher-owned) → duyệt
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/oxford-fullchain.spec.ts:101:44

    Error Context: test-results/oxford-fullchain-Full-chai-a0078-e-→-word-vào-book-với-audio-chromium-retry1/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/oxford-fullchain-Full-chai-a0078-e-→-word-vào-book-với-audio-chromium-retry1/trace.zip
    Usage:

        npx playwright show-trace test-results/oxford-fullchain-Full-chai-a0078-e-→-word-vào-book-với-audio-chromium-retry1/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/oxford-fullchain.spec.ts:237:7 › Full-chain SF-4 › full-chain: review session mới phát audio Blob (listen → play → gõ từ chấm server) 
  1 flaky
    [chromium] › e2e/oxford-fullchain.spec.ts:81:7 › Full-chain SF-4 › full-chain: crawl-on-add cache-hit REAL → approve → word vào book với audio 
  3 passed (1.7m)

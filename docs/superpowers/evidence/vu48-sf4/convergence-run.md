# VU-48 SF-4 convergence run — 2026-10-15 09:57:27
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [09:57:27] sf3 ...
  PASS sf3 (26 passed)
— [09:59:19] sf4 ...
  PASS sf4 (46 passed)
— [10:03:19] today ...
  PASS today (11 passed)
— [10:04:39] vocabulary ...
  PASS vocabulary (2 passed)
— [10:04:51] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [10:05:16] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [10:05:29] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [10:06:09] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [10:06:42] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [10:07:10] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [10:07:48] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [10:09:59] vocabulary-review-upgrade ...
  PASS vocabulary-review-upgrade (5 passed)
— [10:11:35] top-users-vocab ...
  PASS top-users-vocab (3 passed)
— [10:12:00] dictation ...
  PASS dictation (114 passed)
— [10:16:44] oxford ...
  PASS oxford (7 passed)
— [10:17:28] oxford-fullchain ...
  **FAIL oxford-fullchain** — log /tmp/sweep-sf4/oxford-fullchain.log (tail):
    > 340 |     await expect(page.getByText("Phiên hoàn tất")).toBeVisible();
          |                                                    ^
      341 |
      342 |     // cả 2 từ type-đúng → due tương lai → hàng ôn rỗng (persist QUA API mới)
      343 |     await page.reload({ waitUntil: "domcontentloaded" });
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/oxford-fullchain.spec.ts:340:52

    Error Context: test-results/oxford-fullchain-Full-chai-760fe-→-play-→-gõ-từ-chấm-server--chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/oxford-fullchain-Full-chai-760fe-→-play-→-gõ-từ-chấm-server--chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/oxford-fullchain-Full-chai-760fe-→-play-→-gõ-từ-chấm-server--chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    [chromium] › e2e/oxford-fullchain.spec.ts:237:7 › Full-chain SF-4 › full-chain: review session mới phát audio Blob (listen → play → gõ từ chấm server) 
  4 passed (1.0m)

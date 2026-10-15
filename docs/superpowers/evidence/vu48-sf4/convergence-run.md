# VU-48 SF-4 convergence run — 2026-10-15 08:51:14
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [08:51:14] sf3 ...
  PASS sf3 (26 passed)
— [08:53:07] sf4 ...
  PASS sf4 (46 passed)
— [08:57:09] today ...
  PASS today (11 passed)
— [08:58:27] vocabulary ...
  PASS vocabulary (2 passed)
— [08:58:40] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [08:59:05] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [08:59:18] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [08:59:57] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [09:00:30] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [09:00:58] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [09:01:37] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [09:03:47] vocabulary-review-upgrade ...
  PASS vocabulary-review-upgrade (5 passed)
— [09:05:24] top-users-vocab ...
  PASS top-users-vocab (3 passed)
— [09:05:48] dictation ...
  **FAIL dictation** — log /tmp/sweep-sf4/dictation.log (tail):
      35 |     }
      36 |   }
        at skipToPart (/Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/dictation-scoring-edges.spec.ts:33:10)
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/dictation-scoring-edges.spec.ts:167:11

    Error Context: test-results/dictation-scoring-edges-Di-abb96-tra-đỏ-KHÔNG-chip-XP-vẫn-10-chromium/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/dictation-scoring-edges-Di-abb96-tra-đỏ-KHÔNG-chip-XP-vẫn-10-chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/dictation-scoring-edges-Di-abb96-tra-đỏ-KHÔNG-chip-XP-vẫn-10-chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  2 failed
    [chromium] › e2e/dictation-i18n.spec.ts:58:7 › Dictation i18n (en/vi lesson thật) › VI flow: check sai → diff note strict vi; sửa → 'Chính xác!'; skip hết → Results vi đầy đủ 
    [chromium] › e2e/dictation-scoring-edges.spec.ts:156:7 › Dictation scoring edges (UI vs diff.ts truth) › Extra tokens anti-gaming: accuracy 100% nhưng KHÔNG 'Exactly right!'; extra đỏ KHÔNG chip; XP vẫn 10 
  4 did not run
  108 passed (9.4m)

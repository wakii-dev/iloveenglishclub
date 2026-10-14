# VU-48 SF-4 convergence run — 2026-10-14 23:18:05
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [23:18:05] sf3 ...
  PASS sf3 (26 passed)
— [23:20:06] sf4 ...
  PASS sf4 (46 passed)
— [23:24:36] today ...
  PASS today (11 passed)
— [23:26:17] vocabulary ...
  PASS vocabulary (2 passed)
— [23:26:53] vocabulary-quiz ...
  PASS vocabulary-quiz (3 passed)
— [23:27:53] vocabulary-lookup ...
  PASS vocabulary-lookup (1 passed)
— [23:28:32] vocabulary-hub ...
  PASS vocabulary-hub (7 passed)
— [23:29:34] vocabulary-hub-quiz ...
  PASS vocabulary-hub-quiz (4 passed)
— [23:30:09] vocabulary-learn ...
  PASS vocabulary-learn (4 passed)
— [23:30:40] vocabulary-dashboard ...
  PASS vocabulary-dashboard (6 passed)
— [23:31:24] vocabulary-learn-session ...
  PASS vocabulary-learn-session (5 passed)
— [23:33:38] vocabulary-review-upgrade ...
  PASS vocabulary-review-upgrade (5 passed)
— [23:35:19] top-users-vocab ...
  PASS top-users-vocab (3 passed)
— [23:35:44] dictation ...
  **FAIL dictation** — log /tmp/sweep-sf4/dictation.log (tail):
    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/progress-xp-truth-XP-modif-475ec-đều-5-XP-×0-5-server-truth--chromium/trace.zip
    Usage:

        npx playwright show-trace test-results/progress-xp-truth-XP-modif-475ec-đều-5-XP-×0-5-server-truth--chromium/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  9 failed
    [chromium] › e2e/dictation-audio-controls.spec.ts:89:7 › Dictation audio controls › Part không có audio: player disabled note + flow dictation VẪN chạy (hint/check/next) 
    [chromium] › e2e/dictation-i18n.spec.ts:117:7 › Dictation i18n (en/vi lesson thật) › Relaxed toggle vi: 'Tha thứ ×0.5' + description tooltip; note đổi sang relaxed vi 
    [chromium] › e2e/dictation-nav-results.spec.ts:72:7 › Dictation nav / progress / results / transcript › Progress bar bước theo DONE: 25% → 50%; SKIP không tăng 
    [chromium] › e2e/dictation-scoring-edges.spec.ts:76:7 › Dictation scoring edges (UI vs diff.ts truth) › QA apostrophe: transcript ’ cong, gõ ' thẳng — strict matched (tokenize normalize) 
    [chromium] › e2e/i18n-robots-middleware.spec.ts:15:5 › robots.txt: allow all trừ /admin + /api, sitemap absolute 
    [chromium] › e2e/i18n-sitemap.spec.ts:26:5 › sitemap: chỉ published — draft lesson vắng mặt, published có đủ 2 locale 
    [chromium] › e2e/i18n-sitemap.spec.ts:40:5 › sitemap: MỌI URL resolve 200 (fetch thật, origin rewrite về server local) 
    [chromium] › e2e/i18n-sitemap.spec.ts:62:5 › sitemap entry: hreflang cặp en↔vi + x-default→en trong từng <url> 
    [chromium] › e2e/progress-xp-truth.spec.ts:24:7 › XP modifiers truth (SF-3) › relaxed toggle UI → part đúng → preview chip VÀ header đều 5 XP (×0.5 server truth) 
  12 did not run
  93 passed (8.3m)

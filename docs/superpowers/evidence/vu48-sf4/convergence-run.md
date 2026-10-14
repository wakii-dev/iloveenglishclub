# VU-48 SF-4 convergence run — 2026-10-14 23:09:06
DB: ilec_dj_sf4 (local clone, migration 0007) · MỌI test:e2e:* + vitest + rls + typecheck + build — liên tiếp 1 lượt

— [23:09:07] sf3 ...
  PASS sf3 (26 passed)
— [23:10:55] sf4 ...
  **FAIL sf4** — log /tmp/sweep-sf4/sf4.log (tail):
      65 |     await page.goto(`/admin/books/level-3/units/${NUM}/lessons`);
      66 |     const u2 = await createLessonViaUi(page, "Lesson Two");
      67 |     expect(u2).toMatch(/\/lessons\/2$/);
        at /Users/hoivu/orca/workspaces/iloveenglishclup/sf-4-daily-journey/e2e/admin-lessons.spec.ts:64:16

    Error Context: test-results/admin-lessons-Lessons-CRUD-72239-max-1-breadcrumb-điều-hướng/error-context.md

    Error Context: test-results/admin-lessons-Lessons-CRUD-72239-max-1-breadcrumb-điều-hướng/error-context.md

    attachment #3: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/admin-lessons-Lessons-CRUD-72239-max-1-breadcrumb-điều-hướng/trace.zip
    Usage:

        npx playwright show-trace test-results/admin-lessons-Lessons-CRUD-72239-max-1-breadcrumb-điều-hướng/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    e2e/admin-lessons.spec.ts:62:7 › Lessons CRUD edge (SF-4) › auto-number 1,2,3 (max+1) + breadcrumb điều hướng 
  45 passed (3.9m)

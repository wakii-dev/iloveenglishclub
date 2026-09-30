import { defineConfig } from "@playwright/test";

/**
 * E2E config SF-4 QA hardening (VU-28) — KHÔNG chạy trong CI `npm test`.
 * Chạy tay: npm run test:e2e:sf4 (cần local Postgres `ilec_sf4` migrated+seeded
 * + ADMIN_EMAIL/ADMIN_PASSWORD + AUTH_SECRET trong .env.local).
 *
 * Isolation (context pack sf-4): DB riêng `ilec_sf4` (qua .env.local DATABASE_URL),
 * port riêng 3010, globalSetup reuse `e2e/global-setup.ts` (env-driven — tạo admin
 * TRÊN ilec_sf4). testMatch ANCHORED `/admin-[^/]*\.spec\.ts$` — baseline regex
 * `/admin-.*\.spec\.ts/` KHÔNG anchor match theo đường dẫn tuyệt đối nên ở worktree
 * tên chứa "admin-" (vd sf-4-admin-cms-qa) nó nhặt cả dictation/i18n/progress
 * (QA-300): `[^/]*` không vượt dấu "/" → chỉ file admin-*.spec.ts thật.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-[^/]*\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Suite đụng DB state dùng chung (unit number unique-per-run, demo lesson) —
  // chạy TUẦN TỰ, không parallel (sẽ tự giành unit số + unpublish lẫn nhau)
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3010",
    trace: "retain-on-failure",
    locale: "vi-VN",
  },
  webServer: {
    // QA-7 (SF-6 fix): webpack dev — bypass --turbopack (race font 1/4-1/7
    // start, audit SF-1); script `dev` dùng chung không đổi (team HMR).
    command: "npx next dev --port 3010",
    url: "http://localhost:3010/en",
    // port 3010 riêng tránh bẫy chéo worktree (QA-2); server stale từ run cũ
    // vẫn phải kill tay khi nghi env cũ (lsof -i :3010)
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

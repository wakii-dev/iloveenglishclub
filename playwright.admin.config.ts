import { defineConfig } from "@playwright/test";

/**
 * E2E config (SF-5) — KHÔNG chạy trong CI `npm test` (vitest include src/**).
 * Chạy tay: npm run test:e2e (cần local Postgres ilec migrated+seeded +
 * ADMIN_EMAIL/ADMIN_PASSWORD trong .env.local).
 *
 * Merge sf-5: tách khỏi playwright.config.ts (SF-4, port 3100) — testMatch
 * giới hạn suite admin để không nhặt spec dictation (testDir chung ./e2e).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /admin-.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Suite đụng DB state dùng chung (unit number, lesson demo, attempts) —
  // chạy TUẦN TỰ, không parallel (4 workers sẽ tự giẫm chân: trùng số unit,
  // unpublish lesson đang test...)
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "vi-VN",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/en",
    reuseExistingServer: true, // dev server đang chạy (Rule 0 browser) → reuse
    timeout: 120_000,
  },
});

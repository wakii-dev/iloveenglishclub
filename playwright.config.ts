import { defineConfig } from "@playwright/test";

/**
 * E2E config (SF-5) — KHÔNG chạy trong CI `npm test` (vitest include src/**).
 * Chạy tay: npm run test:e2e (cần local Postgres ilec migrated+seeded +
 * ADMIN_EMAIL/ADMIN_PASSWORD trong .env.local).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
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

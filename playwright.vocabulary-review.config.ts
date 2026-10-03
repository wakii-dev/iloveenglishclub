import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E review flow (story vocabulary-module SF-3 t-3.3) — copy pattern
 * playwright.vocabulary.config.ts (SF-2): port RIÊNG 3311 qua E2E_PORT
 * (một nguồn cho baseURL/webServer.url/command), globalSetup/teardown seed +
 * tidy fixture qa-review-* (e2e/vocabulary-review-fixture.ts). testMatch NEO
 * basename `review-flow` — không đụng suite khác (spec tên có "vocabulary"
 * sẽ trúng testMatch của config SF-2 — dùng review-flow để né). Bảng
 * words/user_word_progress phải có (migration 0002) — setup fail rõ nếu
 * chưa migrate, không giả lập DB.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3311);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/me/vocabulary`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)review-flow\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-review-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-review-global-teardown.ts",
  timeout: 120_000,
  fullyParallel: false, // fixture DB dùng chung — tuần tự như các suite khác
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6)
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E quiz flow (story vocabulary-module SF-4 t-4.4) — copy pattern
 * playwright.vocabulary-review.config.ts (SF-3): port RIÊNG 3312 qua E2E_PORT
 * (một nguồn cho baseURL/webServer.url/command), globalSetup/teardown seed +
 * tidy fixture qa-quiz-* (e2e/vocabulary-quiz-fixture.ts). testMatch NEO
 * basename `quiz-flow` — không đụng suite khác. Bảng words / book_words /
 * quiz_attempts phải có (migration 0002) — setup fail rõ nếu chưa migrate,
 * không giả lập DB.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3312);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)quiz-flow\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-quiz-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-quiz-global-teardown.ts",
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

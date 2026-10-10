import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E dashboard home Memrise-style (vocab-memrise SF-4, VU-41) — copy pattern
 * playwright.vocabulary-hub.config.ts: port RIÊNG 3319 qua E2E_PORT (một nguồn
 * cho baseURL/webServer.url/command), globalSetup/teardown seed + tidy fixture
 * qa-dash-* (e2e/vocabulary-dashboard-fixture.ts). testMatch NEO basename
 * `dashboard` — né testMatch `/vocabulary*` + `hub-*` của các config khác.
 * Bảng words/book_words/user_word_progress/vocab_activity/daily_activity phải
 * có (migration 0002+0005) — setup fail rõ nếu chưa migrate.
 * Continue-card CHỈ assert href — KHÔNG navigate vào learn runner (route SF-3
 * có thể chưa merge — 404 interim là expected, context pack mục 9).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3319);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/vi/vocabulary`;

export default defineConfig({
  testDir: "../e2e",
  testMatch: /(^|\/)dashboard\.spec\.ts$/,
  globalSetup: "../e2e/vocabulary-dashboard-global-setup.ts",
  globalTeardown: "../e2e/vocabulary-dashboard-global-teardown.ts",
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
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6); trang hub là
    // force-dynamic nên seed words ở globalSetup là đủ, progress spec tự seed
    command: `cd .. && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

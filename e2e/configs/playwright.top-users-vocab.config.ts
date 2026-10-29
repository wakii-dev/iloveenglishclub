import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E top-users vocab XP (vocab-memrise SF-5, VU-42 — context pack #2) — copy
 * pattern playwright.vocabulary-dashboard.config.ts: port RIÊNG 3340 qua
 * E2E_PORT (một nguồn cho baseURL/webServer.url/command; 3320 ĐÃ bị lane
 * oxford-crawl chiếm — review P1 VU-42), globalSetup/teardown seed + tidy
 * fixture qa-tu-* (e2e/top-users-vocab-fixture.ts). testMatch NEO basename
 * `top-users-vocab` — không trùng testMatch config nào khác (dictation 3212
 * chỉ match ^(dictation|progress|i18n); module vocabulary match ^vocabulary).
 * Seed TRƯỚC server bind: /top-users ISR revalidate=60.
 * View leaderboard (migration 0006) + bảng words/vocab_activity/daily_activity
 * phải có — setup fail rõ nếu chưa migrate.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3340);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/top-users`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)top-users-vocab\.spec\.ts$/,
  globalSetup: "./e2e/top-users-vocab-global-setup.ts",
  globalTeardown: "./e2e/top-users-vocab-global-teardown.ts",
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

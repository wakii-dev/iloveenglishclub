import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E /today (daily-journey SF-3, VU-51) — copy pattern
 * playwright.vocabulary-dashboard.config.ts: port RIÊNG 3321 qua E2E_PORT
 * (3320 ĐÃ DÙNG oxford-crawl — context pack verified), globalSetup/teardown
 * seed + tidy fixture qa-today-* (e2e/today-fixture.ts — quest-hash runtime
 * search). testMatch NEO basename `today-` — né `dashboard`/`hub-*` của các
 * config khác (lesson SF-3 QA: anchor biên path, không regex trống).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3321);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/vi/today`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)today-.*\.spec\.ts$/,
  globalSetup: "./e2e/today-global-setup.ts",
  globalTeardown: "./e2e/today-global-teardown.ts",
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
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6); trang /today
    // force-dynamic nên seed globalSetup là đủ
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

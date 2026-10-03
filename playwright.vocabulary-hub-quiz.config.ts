import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E hub quiz tổng (story vocabulary-hub SF-3 t-3.3) — copy pattern
 * playwright.vocabulary-hub.config.ts: port RIÊNG 3316 qua E2E_PORT, global
 * setup/teardown seed + tidy fixture qa-hub-* (e2e/vocabulary-hub-fixture.ts)
 * kèm gate migration 0003 — quiz_attempts.book_id phải nullable (scope
 * all/multi lưu attempt book_id NULL); thiếu → setup fail rõ kèm hướng dẫn,
 * không giả lập DB. testMatch NEO basename `hub-quiz` — né testMatch các
 * config khác (hub-(overview|library), vocabulary*, quiz-flow).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3316);
const BASE = `http://localhost:${PORT}`;
// poll URL guest-200 trực tiếp (tab=quiz guest bị redirect login)
const PAGE = `/en/vocabulary?tab=library`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)hub-quiz\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-hub-quiz-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-hub-quiz-global-teardown.ts",
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
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6); tab quiz hub
    // force-dynamic → đề xáo mới mỗi reload
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

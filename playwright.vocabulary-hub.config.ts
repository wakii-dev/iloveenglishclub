import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E vocabulary hub (story vocabulary-hub SF-1 t-1.3, mở rộng SF-2) — copy
 * pattern playwright.vocabulary-review.config.ts: port RIÊNG 3314 qua
 * E2E_PORT (một nguồn cho baseURL/webServer.url/command), globalSetup/
 * teardown seed + tidy fixture qa-hub-* (e2e/vocabulary-hub-fixture.ts).
 * testMatch NEO basename `hub-*` — spec tên có "vocabulary" sẽ trúng
 * testMatch `/vocabulary*` của config module vocabulary (convention
 * review-flow). Bảng words / book_words / user_word_progress phải có
 * (migration 0002) — setup fail rõ nếu chưa migrate, không giả lập DB.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3314);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/vocabulary`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)hub-(overview|library)\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-hub-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-hub-global-teardown.ts",
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
    // force-dynamic (data cá nhân, không cache) nên seed words ở globalSetup
    // là đủ, progress spec tự seed giữa test
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

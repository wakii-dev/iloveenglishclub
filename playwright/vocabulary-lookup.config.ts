import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E word-lookup popover (story vocabulary-module SF-5 t-5.3) — copy pattern
 * playwright.vocabulary-quiz.config.ts (SF-4): port RIÊNG 3313 qua E2E_PORT
 * (một nguồn cho baseURL/webServer.url/command), globalSetup/teardown seed +
 * tidy fixture "football" (e2e/vocabulary-lookup-fixture.ts). testMatch NEO
 * basename `word-lookup` — không đụng suite khác. Bảng words / book_words phải
 * có (migration 0002) — setup fail rõ nếu chưa migrate, không giả lập DB.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3313);
const BASE = `http://localhost:${PORT}`;
// Poll đúng trang bài học — buộc Next dev compile route lesson TRƯỚC khi test
// chạy; lazy-compile giữa test đẩy webpack runtime hot-update → remount nuốt
// click "Start part" (fail 03/10 khi chạy sau các suite khác).
const PAGE = `/en/books/level-3/units/1/lessons/1/listen-and-type`;

export default defineConfig({
  testDir: "../e2e",
  testMatch: /(^|\/)word-lookup\.spec\.ts$/,
  globalSetup: "../e2e/vocabulary-lookup-global-setup.ts",
  globalTeardown: "../e2e/vocabulary-lookup-global-teardown.ts",
  timeout: 120_000,
  fullyParallel: false, // fixture DB dùng chung — tuần tự như các suite khác
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    launchOptions: {
      // stability headless (pattern sf2) — autoplay không chặn flow popover
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6)
    command: `cd .. && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

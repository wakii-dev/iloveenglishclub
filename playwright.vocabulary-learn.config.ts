import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E vocabulary learn (story vocabulary-learn sf-1) — copy pattern
 * playwright.vocabulary-hub.config.ts: port RIÊNG 3315 qua E2E_PORT (một
 * nguồn cho baseURL/webServer.url/command), globalSetup/teardown seed + tidy
 * fixture qa-learn-* (e2e/vocabulary-learn-fixture.ts). testMatch NEO basename
 * `learn-flow` — spec tên có "vocabulary" sẽ trúng testMatch `/vocabulary*`
 * của config module vocabulary (convention review-flow/hub). Bảng words /
 * book_words / user_word_progress phải có (migration 0002) — setup fail rõ
 * nếu chưa migrate, không giả lập DB.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3315);
const BASE = `http://localhost:${PORT}`;
const PAGE = "/en/books/level-1/vocabulary";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)learn-flow\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-learn-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-learn-global-teardown.ts",
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
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6). Seed TRƯỚC khi
    // server bind: Playwright start webServer + poll URL TRƯỚC globalSetup —
    // render đầu (poll + dev prerender generateStaticParams) chạy khi DB chưa
    // có fixture → unstable_cache `content` giữ [] suốt run (fail 03/10,
    // 987a9e8). node24 chạy .ts native (strip-only).
    command: `node --input-type=module -e "import('./e2e/vocabulary-learn-fixture.ts').then(m=>m.ensureLearnWordsFixture()).then(()=>process.exit(0))" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

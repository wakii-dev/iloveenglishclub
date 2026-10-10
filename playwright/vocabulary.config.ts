import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E vocabulary public (story vocabulary-module SF-2 t-2.3) — copy pattern
 * playwright.sf2.config.ts: port RIÊNG 3310 qua E2E_PORT (một nguồn cho
 * baseURL/webServer.url/command), globalSetup/teardown seed + tidy fixture
 * qa-vocab-* (e2e/vocabulary-fixture.ts). testMatch NEO basename `/vocabulary`
 * — chỉ nhặt vocabulary-public.spec.ts, không đụng suite khác. Bảng
 * words/book_words phải có (migration 0002) — setup fail rõ nếu chưa migrate.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3310);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/books/level-3/vocabulary`;

export default defineConfig({
  testDir: "../e2e",
  testMatch: /\/vocabulary[^/]*\.spec\.ts$/,
  globalSetup: "../e2e/vocabulary-global-setup.ts",
  globalTeardown: "../e2e/vocabulary-global-teardown.ts",
  timeout: 60_000,
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
    // có fixture → unstable_cache `content` giữ [] suốt run (fail 03/10).
    command: `cd .. && node --input-type=module -e "import('./e2e/vocabulary-fixture.ts').then(m=>m.ensureVocabularyFixture()).then(()=>process.exit(0))" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

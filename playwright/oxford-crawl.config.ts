import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E SF-3 crawl admin UI (VU-32 SF-3, context pack §7) — copy pattern
 * playwright.vocabulary.config.ts: port RIÊNG 3320 qua E2E_PORT (một nguồn
 * cho baseURL/webServer.url/command), globalSetup/teardown seed + tidy fixture
 * `qa-sf3-*` / `qasf3-*` (e2e/oxford-crawl-fixture.ts). testMatch NEO basename
 * `/oxford-crawl` — chỉ nhặt oxford-crawl-*.spec.ts, không đụng suite khác.
 *
 * Bootstrap ASSERT migration 0004 (crawl_entries) — DB template VU-24
 * ilec_sf2..sf5 KHÔNG có bảng này (không tái dùng mù — fixture throw rõ).
 * Upstream Oxford MOCK: cache-hit đi REAL API (seed crawl_entries); miss-path
 * fulfill response /crawl/word ở tầng BROWSER (page.route) với entry derive
 * từ fixture HTML SF-1 qua parseEntry (pure) — fetch server-side KHÔNG thể
 * intercept bằng Playwright route (dev server process riêng), và KHÔNG gọi
 * Oxford thật trong e2e (boundary context pack).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3320);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/vi/login`;

export default defineConfig({
  testDir: "../e2e",
  testMatch: /\/oxford-crawl[^/]*\.spec\.ts$/,
  globalSetup: "../e2e/oxford-crawl-global-setup.ts",
  globalTeardown: "../e2e/oxford-crawl-global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 }, // pattern admin config — compile lạnh login/action
  fullyParallel: false, // fixture DB dùng chung — tuần tự như các suite khác
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    locale: "vi-VN",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6). Seed TRƯỚC khi
    // server bind (pattern vocabulary config): Playwright start webServer +
    // poll URL TRƯỚC globalSetup — fixture phải sẵn trước lần render đầu.
    command: `cd .. && node --input-type=module -e "import('./e2e/oxford-crawl-fixture.ts').then(m=>m.ensureOxfordCrawlFixture()).then((i)=>{console.log('[seed] book='+i.bookSlug);process.exit(0)}).catch((e)=>{console.error(e);process.exit(1)})" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

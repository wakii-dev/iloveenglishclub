import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E SF-4 fullchain (VU-32 SF-4, context pack §spec slice 2) — copy pattern
 * playwright.oxford-crawl.config.ts (SF-3): port RIÊNG 3330 qua E2E_PORT
 * (một nguồn cho baseURL/webServer.url/command), globalSetup/teardown seed +
 * tidy fixture `qa-sf4-*` / `qasf4*` (e2e/oxford-fullchain-fixture.ts).
 *
 * testMatch NEO basename `/oxford-fullchain` — CHỈ nhặt oxford-fullchain.spec.ts.
 * Tên file spec CỐ Ý KHÔNG bắt đầu "oxford-crawl" để testMatch của SF-3
 * (`/\/oxford-crawl[^/]*\.spec\.ts$/`) KHÔNG nhặt chéo khi chạy
 * test:e2e:oxford (suite 7 test SF-3 phải đứng yên).
 *
 * Upstream Oxford KHÔNG bị gọi trong e2e: crawl-on-add đi cache-hit REAL API
 * (crawl entry seeded — resolveApproveAudio DB-lookup-first lấy audio từ entry,
 * KHÔNG download) + test 3 route-abort mọi request tới host Oxford ở tầng
 * browser làm guard hermetic runtime (regression làm preview live-fetch →
 * test fail ngay). Enrich thuần DB (fixture crawl entry seeded parsed).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3330);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/vi/login`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /\/oxford-fullchain[^/]*\.spec\.ts$/,
  globalSetup: "./e2e/oxford-fullchain-global-setup.ts",
  globalTeardown: "./e2e/oxford-fullchain-global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
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
      use: {
        ...devices["Desktop Chrome"],
        // audio.play() không cần user gesture trong headless — nới policy như
        // sf3 config (suite có bấm nút phát thật)
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
  ],
  webServer: {
    // webpack dev — bypass --turbopack (race font, QA-7 SF-6). Seed TRƯỚC khi
    // server bind (pattern vocabulary config): Playwright start webServer +
    // poll URL TRƯỚC globalSetup — fixture phải sẵn trước lần render đầu.
    command: `node --input-type=module -e "import('./e2e/oxford-fullchain-fixture.ts').then(m=>m.ensureOxfordFullchainFixture()).then((i)=>{console.log('[seed] book='+i.bookSlug);process.exit(0)}).catch((e)=>{console.error(e);process.exit(1)})" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

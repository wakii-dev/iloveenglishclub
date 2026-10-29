import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * UNIFIED playwright config — chuẩn create-wakii-app (1 config duy nhất, mọi spec chạy trên đó).
 *
 * Hợp nhất 2026-10-29 từ 18 config rời (mỗi feature 1 file + port riêng) thành
 * 1 config theo yêu cầu: "chỉ được có 1 file config playwright và tất cả các spec
 * cần chạy trên đó". Specs vốn thiết kế tuần tự dùng chung DB fixture nên cùng
 * server an toàn (workers: 1). Oxford crawl (playwright.oxford-*.config.ts) là
 * CRAWL SCRIPTS không phải test app — giữ riêng 2 file chuẩn starter.
 *
 * Chạy:
 *   npx playwright test                          # mọi spec (tuần tự)
 *   npx playwright test --grep @smoke            # chỉ smoke
 *   npx playwright test e2e/dictation-guest.spec.ts
 *
 * Env: E2E_PORT (default 3110), E2E_BASE_PATH (webServer ready-probe).
 * DB: .env.local + drizzle-kit migrate + node scripts/seed.ts.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3110);
const BASE = `http://localhost:${PORT}`;
const PAGE = process.env.E2E_BASE_PATH ?? `/vi`;

export default defineConfig({
  testDir: "./e2e",
  // Mọi spec e2e/*.spec.ts (configs cũ đã gỡ; smoke prefix không còn bắt buộc)
  testMatch: /(^|\/)[a-z][\w.-]*\.spec\.ts$/,
  // Seed words qa-hub-* cho smoke vocabulary (teardown dọn) — từ config v2 cũ
  globalSetup: "./e2e/smoke-global-setup.ts",
  globalTeardown: "./e2e/smoke-global-teardown.ts",
  timeout: 60_000,
  fullyParallel: false, // DB fixture dùng chung — tuần tự
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
    command: `npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

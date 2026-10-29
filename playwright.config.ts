import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E ilec-v2 — base config SMOKE (migrate SF4): 2 smoke đầu của v2.
 * - smoke-vocabulary-hub.spec.ts — hub tab Thư viện guest (fixture qa-hub-*)
 * - smoke-dictation-guest.spec.ts — happy path bài demo L3-U1-L1 (seed SF-2)
 *
 * Port 3110 (port suite dictation của ilec gốc). DB scratch `ilec_v2_dev`
 * (brew postgres) — setup: .env.local + `drizzle-kit migrate` + `node
 * scripts/seed.ts` (books level-1..7 + lesson demo + audio). globalSetup chỉ
 * seed words qa-hub-* + assert bảng/điều kiện, fail RÕ nếu DB chưa setup.
 *
 * Chạy: npx playwright test --config playwright.config.ts --grep @smoke
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3110);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/vocabulary`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)smoke-.*\.spec\.ts$/,
  globalSetup: "./e2e/smoke-global-setup.ts",
  globalTeardown: "./e2e/smoke-global-teardown.ts",
  timeout: 120_000,
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

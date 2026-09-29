import { defineConfig, devices } from "@playwright/test";

/**
 * E2E SF-4 (context pack #13): guest + ephemeral + banner — happy path bài
 * demo L3-U1-L1 (seed SF-2). Port 3110 (SF-6 đổi từ 3100 — SF-7 song song
 * đang dùng 3100, 2 suite giành port kill server của nhau); Chromium +
 * autoplay policy nới cho headless. Env từ .env.local (DB local `ilec`).
 *
 * Merge sf-5: suite admin có config riêng (playwright.admin.config.ts — port
 * 3000 + globalSetup admin). Hai config chia testMatch theo prefix spec để
 * không nhặt spec của nhau (testDir chung ./e2e).
 *
 * Merge sf-6 regression (SF-8 audit phát hiện, verify --list): testMatch bị
 * khôi phục dictation-only → progress.spec.ts (SF-6) + i18n-switch.spec.ts
 * (SF-7) mồ côi không config nào chạy. KHÔNG có `-` sau prefix — file là
 * `progress.spec.ts` (không hyphen).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(dictation|progress|i18n).*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false, // store singleton + DB seed — chạy tuần tự cho ổn định
  workers: 1, // SF-8: testMatch fix lộ 3 file — files song song giành DB state dùng chung (flaky: fail khác nhau mỗi run); admin config đã cùng pattern
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3110",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3110",
    url: "http://localhost:3110/en/books/level-3/units/1/lessons/1/listen-and-type",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

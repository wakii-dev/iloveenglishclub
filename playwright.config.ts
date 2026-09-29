import { defineConfig, devices } from "@playwright/test";

/**
 * E2E SF-4 (context pack #13): guest + ephemeral + banner — happy path bài
 * demo L3-U1-L1 (seed SF-2). Port 3100 tránh đụng dev thường; Chromium +
 * autoplay policy nới cho headless. Env từ .env.local (DB local `ilec`).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false, // store singleton + DB seed — chạy tuần tự cho ổn định
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/en/books/level-3/units/1/lessons/1/listen-and-type",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

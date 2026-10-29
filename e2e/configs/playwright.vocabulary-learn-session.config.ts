import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E learn session UI (vocab-memrise SF-3, VU-40) — copy pattern
 * playwright.vocabulary-learn.config.ts (3315): port RIÊNG 3317 qua E2E_PORT,
 * globalSetup/teardown seed + tidy book qa-ls-book. testMatch NEO basename
 * `learn-session` — spec tên có "vocabulary" sẽ trúng testMatch config module.
 * Seed TRƯỚC khi server bind (webServer command chạy fixture trước next dev —
 * bài học unstable_cache 987a9e8). Bảng words/book_words/user_word_progress/
 * vocab_activity phải có (migration vocab SF-1) — setup fail rõ nếu thiếu.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3317);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/vocabulary/learn/9904`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)learn-session\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-learn-session-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-learn-session-global-teardown.ts",
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
    // server bind: Playwright poll URL TRƯỚC globalSetup — render đầu chạy khi
    // DB chưa có fixture → unstable_cache giữ [] suốt run (987a9e8).
    command: `node --input-type=module -e "import('./e2e/vocabulary-learn-session-fixture.ts').then(m=>m.ensureLearnSessionFixture()).then(()=>process.exit(0))" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

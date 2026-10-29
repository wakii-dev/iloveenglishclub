import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E review session UI (vocab-memrise SF-3, VU-40) — migrate coverage từ
 * suite 3311 review-flow (nghỉ hưu): port RIÊNG 3318, globalSetup/teardown
 * book qa-ru-book (e2e/vocabulary-review-upgrade-fixture.ts). testMatch NEO
 * basename `review-upgrade`. Seed TRƯỚC khi server bind (pattern 3315 —
 * unstable_cache 987a9e8). Bảng words/user_word_progress/vocab_activity phải
 * có (migration vocab SF-1) — setup fail rõ nếu thiếu.
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3318);
const BASE = `http://localhost:${PORT}`;
const PAGE = `/en/me/vocabulary`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(^|\/)review-upgrade\.spec\.ts$/,
  globalSetup: "./e2e/vocabulary-review-upgrade-global-setup.ts",
  globalTeardown: "./e2e/vocabulary-review-upgrade-global-teardown.ts",
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
    command: `node --input-type=module -e "import('./e2e/vocabulary-review-upgrade-fixture.ts').then(m=>m.ensureReviewUpgradeFixture()).then(()=>process.exit(0))" && npx next dev --port ${PORT}`,
    url: `${BASE}${PAGE}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

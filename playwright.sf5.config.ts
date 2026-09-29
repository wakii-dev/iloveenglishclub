import { defineConfig, devices } from "@playwright/test";

/**
 * E2E SF-5 QA (context pack qa-hardening/sf-5.md) — SEO/i18n/public pages.
 * Copy từ baseline playwright.config.ts theo config checklist P1-5: testMatch
 * CHỈ suite i18n (spec mới prefix `i18n-*` + i18n-switch sẵn có — anti-orphan
 * P1-3: baseline testMatch cũng chứa `i18n` nên expansion chạy được cả 2 lane),
 * workers:1, retries:0, timeout 60s, port 3 chỗ = 3212 (độc quyền worktree này,
 * chống bẫy chéo worktree QA-2), DATABASE_URL → `ilec_sf5` qua `.env.local`
 * worktree (Next tự nạp). NEXT_PUBLIC_SITE_URL giữ giá trị main — assertion
 * canonical/sitemap neo `http://localhost:3000`; domain thật là SF-6.
 *
 * Specs re-runnable trên DB bất kỳ (lesson SF-4): chỉ anchor fixture TỰ NHIÊN
 * của template (level-3/u1/l1 demo published; level-3/u1/l2 published thiếu
 * title_vi; level-3/u2/l3 draft) — không tạo row.
 */
export default defineConfig({
  testDir: "./e2e",
  // Anchor basename (^|\/ … $): regex testMatch chạy trên FULL PATH — worktree
  // này tên `sf-5-seo-i18n-qa` chứa "i18n" nên pattern trần match MỌI file
  // (phát hiện khi --list ra 58 tests/12 file).
  testMatch: /(^|\/)i18n.*\.spec\.ts$/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3212",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3212",
    url: "http://localhost:3212/en",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E SF-3 QA (VU-24 context pack — dispatch constants): auth/session +
 * progress/gamification. DB RIÊNG `ilec_sf3` (template SF-1, local), PORT 3211
 * (đỏi worktree SF song song — QA-2 reuseExistingServer bẫy chéo worktree).
 *
 * testMatch chỉ suite progress của SF-3: `[\\/]progress.*\.spec\.ts$` — khớp
 * TÊN FILE bắt đầu `progress` (CẢ `progress.spec.ts` SF-6 cũ — task 4 bỏ reload
 * workaround — lẫn expansion mới `progress-*.spec.ts`). Anchor `[\\/]` BẮT
 * BUỘC: regex trống khớp cả ĐƯỜNG DẪN worktree `sf-3-auth-progress-qa` chứa
 * chữ "progress" → nhặt nhầm dictation/i18n spec (đã ăn: --list 17 tests/4
 * files thay vì 3/1). KHÔNG khớp dictation/admin/i18n (config riêng của
 * chúng). Anti-orphan P1-3: baseline config vẫn nhặt progress-* — spec phải
 * pass trên DB seeded BẤT KỲ.
 *
 * Port khớp 3 chỗ (baseURL / webServer.url / webServer.command) qua E2E_PORT
 * (mặc định 3211, .env.local cùng giá trị). Env DB từ .env.local (Next dev
 * tự nạp) — .env.local của worktree phải trỏ `ilec_sf3` (bootstrap task 1).
 */
const PORT = Number(process.env.E2E_PORT ?? 3211);
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "../e2e",
  testMatch: /[\\/]progress.*\.spec\.ts$/,
  timeout: 60_000,
  fullyParallel: false, // DB seed + store singleton — tuần tự cho ổn định
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
      use: {
        ...devices["Desktop Chrome"],
        // register/login flows dùng autoplay ở lesson (commit mid-lesson) —
        // nới policy như baseline cho headless
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      },
    },
  ],
  webServer: {
    // QA-7 (SF-6 fix): webpack dev — bypass --turbopack (race font 1/4-1/7
    // start, audit SF-1); script `dev` dùng chung không đổi (team HMR).
    command: `cd .. && npx next dev --port ${PORT}`,
    url: `${BASE}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

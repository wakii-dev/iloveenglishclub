import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

/**
 * E2E SF-2 Dictation QA (context pack qa-hardening/sf-2.md, checklist P1-5 —
 * copy từ baseline dictation config): DB RIÊNG `ilec_sf2` + port 3210 qua
 * `E2E_PORT` env (một nguồn duy nhất cho cả 3 chỗ baseURL/webServer.url/
 * webServer.command — spec-critic P0-4). KHÔNG sửa 2 baseline configs.
 *
 * testMatch chỉ suite dictation: baseline `dictation-guest.spec.ts`
 * (regression) + expansion mới `dictation-*.spec.ts` (anti-orphan P1-3).
 * Regex NEO basename (`/…$`): testMatch chạy trên path TUYỆT ĐỐI — worktree
 * này tên `sf-2-dictation-qa` nên pattern thoáng `dictation.*` nhặt cả
 * progress/i18n/admin specs (đã gặp thật lần chạy đầu — QA-101).
 * `npm run dev` đọc `.env.local` worktree (DATABASE_URL → ilec_sf2).
 * Autoplay policy nới cho headless ổn định — gesture-gate thật được verify
 * bằng real browser không flags (start-gate task, Rule 0).
 */
dotenv.config({ path: ".env.local" });

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /\/dictation[^/]*\.spec\.ts$/,
  timeout: 60_000,
  fullyParallel: false, // store singleton + DB seed — tuần tự như baseline
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE}${LESSON}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

import fs from "node:fs";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import postgres from "postgres";
import {
  cleanupDashboardFixture,
  ensureDashboardWordsFixture,
  seedDashboardProgress,
} from "./vocabulary-dashboard-fixture.ts";

/**
 * Rule 0 — BROWSER FLOW SF-2 (VU-50 — surface user-visible DUY NHẤT: ring
 * /vocabulary label "từ ôn/luyện hôm nay"; phần còn lại store/API → proxy
 * CLI-equivalent). register qua UI → seed fixture (3 learn-complete distinct
 * → practiced 3/5 — SỐ giữ nguyên so với trước rename) → /vi/vocabulary THẤY
 * label + aria mới (DOM + screenshot) → PATCH /api/today/goal bằng cookie
 * session thật (page.evaluate fetch — authed integration proxy) → persist
 * kiểm DB trực tiếp → guest curl 401 (chạy riêng). Screenshot vào evidence
 * sf-2-today-engine/screens — coordinator tự Read ảnh pixel thật.
 * Chạy: node e2e/rule0-sf2-today-engine.ts (dev server 3318 phải đang sống)
 */

dotenv.config({ path: ".env.local" });
const SHOT_DIR = "docs/superpowers/evidence/sf-2-today-engine/screens";
const BASE = "http://localhost:3318";
const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });

async function main(): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" }); // headless-shell cache thiếu — dùng Chrome hệ thống (ảnh pixel thật như nhau)
  const page = await browser.newPage({ locale: "vi-VN" });
  const shot = (name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
  const results: string[] = [];
  const ok = (label: string, pass: boolean) => {
    results.push(`${pass ? "PASS" : "FAIL"} ${label}`);
    if (!pass) throw new Error(`Rule 0 FAIL: ${label}`);
  };

  // ---- 1. register QA user qua UI (flow thật) ------------------------------
  const email = `qa-sf2-rule0-${Date.now()}@test.ilec`;
  await page.goto(`${BASE}/vi/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/tên hiển thị|display name/i).fill("QA SF2 Rule0");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/mật khẩu|password/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /đăng ký|sign up/i })
    .click();
  await page.waitForURL(/\/(vi|en)$/);
  ok("register qua UI", true);

  // ---- 2. seed fixture — practiced 3/5 (3 learn-complete DISTINCT từ) -----
  await ensureDashboardWordsFixture();
  await seedDashboardProgress(email);

  // ---- 3. /vi/vocabulary — THẤY ring label MỚI (Tầng 1 DOM + Tầng 2 ảnh) --
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { level: 1, name: "Chào QA SF2 Rule0" })
    .waitFor();
  const ring = page.locator('[role="img"][aria-label="Mục tiêu hôm nay: 3 trên 5 từ ôn/luyện"]');
  await ring.waitFor();
  ok("ring aria '3 trên 5 từ ôn/luyện' (SỐ giữ nguyên sau rename)", true);
  ok(
    "card label 'từ ôn/luyện hôm nay'",
    await page.getByText("từ ôn/luyện hôm nay", { exact: true }).isVisible(),
  );
  ok(
    "label cũ 'từ mới hôm nay' KHÔNG còn",
    (await page.getByText("từ mới hôm nay", { exact: true }).count()) === 0,
  );
  await shot("1-vocabulary-ring-vi-label-moi");

  // EN parity
  await page.goto(`${BASE}/en/vocabulary`, { waitUntil: "domcontentloaded" });
  const ringEn = page.locator('[role="img"][aria-label="Today\'s goal: 3 of 5 words practiced"]');
  await ringEn.waitFor();
  ok("EN aria parity '3 of 5 words practiced'", true);
  ok(
    "EN card label 'words practiced today'",
    await page.getByText("words practiced today", { exact: true }).isVisible(),
  );
  await shot("2-vocabulary-ring-en-parity");

  // ---- 4. PATCH /api/today/goal bằng cookie session (authed proxy) --------
  const patch = await page.evaluate(async () => {
    const res = await fetch("/api/today/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 15 }),
    });
    return { status: res.status, body: await res.json() };
  });
  ok(
    "PATCH /api/today/goal {minutes:15} → 200 {ok, dailyGoalMinutes:15}",
    patch.status === 200 &&
      patch.body.ok === true &&
      patch.body.dailyGoalMinutes === 15,
  );

  const invalid = await page.evaluate(async () => {
    const res = await fetch("/api/today/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: 999 }),
    });
    return { status: res.status, body: await res.json() };
  });
  ok(
    "PATCH minutes 999 → 400 invalidMinutes (taxonomy)",
    invalid.status === 400 && invalid.body.error === "invalidMinutes",
  );

  // ---- 5. persist kiểm DB TRỰC TIẾP (proxy reload-keeps) ------------------
  const rows: { daily_goal_minutes: number }[] = await sql`
    select daily_goal_minutes from profiles
    where id = (select id from users where email = ${email})`;
  ok("DB persist daily_goal_minutes=15", rows[0]?.daily_goal_minutes === 15);

  // ---- 6. guest — /vocabulary vẫn render (không ring), API 401 đã curl ----
  await page.context().clearCookies();
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  ok(
    "guest không thấy ring data label (dashboard user-only)",
    (await page.getByText("từ ôn/luyện hôm nay", { exact: true }).count()) === 0,
  );
  await shot("3-guest-vocabulary-khong-ring");

  console.log(results.join("\n"));
  await browser.close();
  await sql.end();
  await cleanupDashboardFixture();
  console.log("RULE0-SF2 DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

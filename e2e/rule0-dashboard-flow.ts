import fs from "node:fs";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import {
  cleanupDashboardFixture,
  ensureDashboardWordsFixture,
  seedDashboardProgress,
} from "./vocabulary-dashboard-fixture.ts";

/**
 * Rule 0 — BROWSER FLOW trọn dashboard (VU-41, kit fallback headless-chrome
 * trên CÙNG build — coordinator tự Read ảnh pixel thật). register qua UI →
 * seed fixture → dashboard: THẤY khối + số → goal 5→10 qua popover → reload
 * giữ → dark toggle → mobile 375 → guest library. Screenshot mỗi màn vào
 * evidence sf-4-dashboard-home-memrise/screens. Cleanup words qa-dash cuối.
 * Chạy: node e2e/rule0-dashboard-flow.ts (dev server 3319 phải đang sống)
 */

dotenv.config({ path: ".env.local" });
const SHOT_DIR =
  "docs/superpowers/evidence/sf-4-dashboard-home-memrise/screens";
const BASE = "http://localhost:3319";

async function main(): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "vi-VN" });
  const shot = (name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
  const shotFull = (name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
  const results: string[] = [];
  const ok = (label: string, pass: boolean) => {
    results.push(`${pass ? "PASS" : "FAIL"} ${label}`);
    if (!pass) throw new Error(`Rule 0 FAIL: ${label}`);
  };

  // 1. register QA user qua UI
  const email = `qa-dash-rule0-${Date.now()}@test.ilec`;
  await page.goto(`${BASE}/en/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill("QA Dash Rule0");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  ok("register qua UI", true);

  // 2. seed fixture số liệu pin
  await ensureDashboardWordsFixture();
  await seedDashboardProgress(email);

  // 3. dashboard VI — THẤY khối bằng mắt (screenshot)
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { level: 1, name: "Chào QA Dash Rule0" })
    .waitFor();
  ok("dashboard h1 Chào", true);
  await shot("1-dashboard-vi-light");
  await shotFull("1b-dashboard-vi-full");
  ok("continue card level-5", await page.getByText("Level 2 · Từ 11–20 — còn 10 từ mới trong level").isVisible());
  ok("goal ring 3/5", await page.getByText("3/5", { exact: true }).isVisible());
  ok("garden 13 từ", await page.getByText("13 từ đang lớn dần").isVisible());
  ok("lộ trình 3 sách", await page.getByText("Lộ trình 3 sách").isVisible());

  // 4. goal 5→10 qua popover — THẤY ring cập nhật (pre-hydration retry)
  const preset10 = page.getByRole("button", { name: "10", exact: true });
  for (let i = 0; i < 6; i++) {
    if (await preset10.isVisible().catch(() => false)) break;
    await page
      .getByRole("button", { name: /Sửa mục tiêu/ })
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
  }
  await shot("2-goal-popover-open");
  await preset10.click();
  await page.getByText("3/10", { exact: true }).waitFor();
  ok("goal 5→10 ring 3/10", true);
  await shot("3-goal-10-ring");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("3/10", { exact: true }).waitFor();
  ok("reload giữ goal 10", true);

  // 5. dark toggle — THẤY class dark scope container (pre-hydration retry)
  const darkSel = page.locator("#vocab-dashboard.dark");
  for (let i = 0; i < 6; i++) {
    if (await darkSel.isVisible().catch(() => false)) break;
    await page
      .getByRole("button", { name: "Chuyển chế độ tối" })
      .click()
      .catch(() => {});
    await page.waitForTimeout(800);
  }
  ok("dark class scope", await darkSel.isVisible());
  await shot("4-dashboard-dark");
  await page.getByRole("button", { name: "Chuyển chế độ sáng" }).click();

  // 6. mobile 375 — THẤY cuộn dùng được
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .getByRole("heading", { level: 1, name: "Chào QA Dash Rule0" })
    .waitFor();
  await shotFull("5-mobile-375-full");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  ok("mobile 375 không tràn ngang", overflow <= 1);

  // 7. guest — library + login redirect
  await page.context().clearCookies();
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  ok("guest thấy Thư viện", await page.getByRole("heading", { level: 2, name: "Thư viện từ vựng" }).isVisible());
  await shot("6-guest-library");
  await page.getByRole("link", { name: "Tổng quan" }).click();
  await page.waitForURL(/\/vi\/login\?next=/);
  ok("guest overview → login ?next", true);
  await shot("7-guest-login-redirect");

  console.log(results.join("\n"));
  await browser.close();

  // cleanup words qa-dash (cascade progress — giữ user vô hại)
  await cleanupDashboardFixture();
  console.log("RULE0 DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

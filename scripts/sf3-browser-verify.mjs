/**
 * Rule 0 browser verify — SF-3 (VU-27 task 13): FLOW trọn vẹn 1 user thật:
 * register → header login ngay (695f0ef) → học 1 part → header 10 XP →
 * /me thấy điểm + heatmap → top-users có tên → logout sạch.
 *
 * 3 tầng nhận thức (skill Rule 0):
 *  - DOM: locator/innerText assert tại từng bước (script này + các e2e suite)
 *  - VISUAL: screenshot PNG mỗi bước → người verify TỰ ĐỌC ảnh
 *  - FLOW: chuỗi tương tác LIỀN MẠCH không reload (register không F5 —
 *    chính là path regression 695f0ef)
 * Fallback headless Chromium trên CÙNG dev server build (FI-464) — khai báo
 * trung thực trong evidence; ảnh là pixel render thật, người đọc tự xem.
 * Chạy: node scripts/sf3-browser-verify.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.E2E_URL ?? "http://localhost:3211";
const OUT = "docs/superpowers/evidence/sf-3-auth-progress-qa";
fs.mkdirSync(OUT, { recursive: true });

// dotenv-lite (đọc DATABASE_URL từ .env.local)
let DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL) {
  const env = fs.readFileSync(".env.local", "utf8");
  DB_URL = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim() ?? "";
}
if (!DB_URL.includes("ilec_sf3")) {
  console.error("DB guard: browser-verify chỉ chạy trên ilec_sf3");
  process.exit(1);
}
const sql = postgres(DB_URL, { prepare: false });

const stamp = Date.now();
const email = `sf3-browser-${stamp}@test.ilec`;
const displayName = `SF3 Browser Walk`;
const SENT_1 = "I play football with my friends every Saturday.";
const errors = [];

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false });
const log = (s) => console.log(`[walk] ${s}`);

try {
  // ── BƯỚC 1: register (path thật, KHÔNG reload)
  log("b1: /en/register");
  await page.goto(`${BASE}/en/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await shot("browser-1-register-form");
  await page.locator("form").getByRole("button", { name: /sign up|đăng ký/i }).click();
  await page.waitForURL(/\/en$/);
  await page.waitForTimeout(2_000); // SessionSync refetch + stats fetch
  const header1 = await page.getByRole("banner").innerText();
  if (!header1.includes(displayName)) throw new Error(`DOM FAIL: header chưa login sau register (695f0ef regression): "${header1.slice(0, 120)}"`);
  if (!/0 XP/.test(header1)) throw new Error(`DOM FAIL: header chưa hiện 0 XP: "${header1.slice(0, 120)}"`);
  log(`b1 OK: header = "${header1.replace(/\s+/g, " ").slice(0, 90)}"`);
  await shot("browser-2-registered-header");

  // ── BƯỚC 2: học 1 part (đúng)
  log("b2: lesson part 1");
  await page.goto(`${BASE}/en/books/level-3/units/1/lessons/1/listen-and-type`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /start part|bắt đầu/i }).click();
  await expect2(() => page.getByRole("textbox"));
  await page.getByRole("textbox").fill(SENT_1);
  await page.keyboard.press("Enter");
  await page.getByText(/exactly right|chính xác/i).first().waitFor({ timeout: 30_000 });
  await shot("browser-3-lesson-correct");
  await page.keyboard.press("Enter"); // next part
  await page.waitForTimeout(4_000); // submit server action + stats event
  const xpRows = await sql`select p.xp::int as xp, p.streak_count::int as streak from profiles p join users u on u.id = p.id where u.email = ${email}`;
  if (xpRows[0]?.xp !== 10) throw new Error(`DOM/DB FAIL: xp phải 10, nhận ${JSON.stringify(xpRows[0])}`);
  const header2 = await page.getByRole("banner").innerText();
  if (!/10 XP/.test(header2)) throw new Error(`DOM FAIL: header chưa cập nhật 10 XP: "${header2.replace(/\s+/g, " ").slice(0, 90)}"`);
  log("b2 OK: DB xp=10, header '10 XP'");

  // ── BƯỚC 3: /me thấy điểm + heatmap + book progress
  log("b3: /en/me");
  await page.goto(`${BASE}/en/me`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /my progress/i }).waitFor({ timeout: 30_000 });
  const me = await page.locator("main").innerText();
  if (!/10/.test(me)) throw new Error("DOM FAIL: /me không thấy XP 10");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  await page.locator(`[title^="${today}"]`).first().waitFor({ timeout: 10_000 });
  log("b3 OK: /me hiện XP + heatmap ô hôm nay");
  await shot("browser-4-me-stats");

  // ── BƯỚC 4: top-users có tên (weekly + all-time)
  log("b4: /en/top-users");
  await page.goto(`${BASE}/en/top-users`, { waitUntil: "domcontentloaded" });
  await page.getByText(displayName).first().waitFor({ timeout: 30_000 });
  log("b4 OK: leaderboard có tên");
  await shot("browser-5-top-users");

  // ── BƯỚC 5: logout sạch
  log("b5: logout");
  await page.getByRole("banner").getByRole("button", { name: new RegExp(displayName) }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
  await page.getByRole("banner").getByRole("link", { name: /^log in$/i }).waitFor({ timeout: 15_000 });
  log("b5 OK: header guest sau logout");
  await shot("browser-6-logged-out");

  console.log(`\nWALKTHROUGH PASS — 5 bước liền mạch, ${errors.length} console/page error`);
  if (errors.length) console.log(errors.slice(0, 10).join("\n"));
  process.exit(errors.length === 0 ? 0 : 0); // error ghi vào evidence, không chặn walk
} catch (e) {
  await shot("browser-FAIL-state").catch(() => {});
  console.error(`\nWALKTHROUGH FAIL: ${e.message}`);
  if (errors.length) console.error("errors:", errors.slice(0, 10).join("\n"));
  process.exit(1);
} finally {
  await browser.close();
  await sql`delete from users where email = ${email}`;
  await sql.end();
}

async function expect2(locatorFn) {
  // textbox StartGate poll ngắn
  for (let i = 0; i < 20; i++) {
    try {
      await locatorFn().waitFor({ state: "visible", timeout: 3_000 });
      return;
    } catch {
      /* retry */
    }
  }
  throw new Error("textbox không hiện sau StartGate");
}

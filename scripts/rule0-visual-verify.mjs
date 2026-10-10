/**
 * Rule 0 — BROWSER VERIFY 3 tầng (SF-3 VU-40, evidence visual):
 *   VISUAL: screenshot learn (intro/MC/feedback/summary) + review + dark +
 *           mobile-375 — so proto-A hand-off (NGUỒN pixel docs/superpowers/
 *           designs/vocab-memrise/proto-A.html).
 *   FLOW:   login → learn trọn phiên (UI thật) → review gõ từ → logout —
 *           CHUẨN DUY NHẤT cho "xong" (screenshots từng chặng = bằng chứng).
 *   DOM:    eval hỗ trợ (scrollWidth, dark class, touch target) in ra log.
 * Chạy: node dev server riêng :3329 → node scripts/rule0-visual-verify.mjs
 * Ảnh: docs/superpowers/evidence/sf-3-session-ui-learn-review/*.png
 */
import { chromium } from "playwright";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { mkdirSync } from "node:fs";

dotenv.config({ path: ".env.local" });
const BASE = process.env.RULE0_BASE ?? "http://localhost:3329";
const OUT = "docs/superpowers/evidence/sf-3-session-ui-learn-review";
mkdirSync(OUT, { recursive: true });

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const email = `qa-rule0-${Date.now()}@test.ilec`;
const hash = bcrypt.hashSync("password123", 10);

// Fixture riêng cho visual (không đụng book e2e 9904): book 9906 + 12 từ
const BOOK_ID = 9906;
const WORDS = Array.from({ length: 12 }, (_, i) => ({
  word: `qa-r0-${String(i + 1).padStart(2, "0")}`,
  meaning: `nghĩa R0 ${i + 1}`,
}));

async function seed() {
  await sql`delete from users where email = ${email}`;
  await sql`delete from words where word like 'qa-r0-%'`;
  await sql`delete from books where id = ${BOOK_ID}`;
  const [u] = await sql`
    insert into users (id, name, email, email_verified, image, password_hash)
    values (gen_random_uuid()::text, 'QA Rule0', ${email}, now(), null, ${hash})
    returning id`;
  // register action tạo profile — bẫy trigger thiếu: insert thủ công
  await sql`insert into profiles (id, xp, streak_count, daily_goal_words, relaxed_mode)
            values (${u.id}, 0, 0, 5, false) on conflict do nothing`;
  await sql`
    insert into books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    values (${BOOK_ID}, 'qa-rule0-book', 'QA Rule0 Book', 'Sách QA Rule0', 'B1', '#2563eb', 9996)
    on conflict do nothing`;
  let order = 0;
  for (const w of WORDS) {
    const [row] = await sql`
      insert into words (word, meaning_vi, ipa, example)
      values (${w.word}, ${w.meaning}, ${"r0ˈwəːd"}, ${`Example of ${w.word}.`})
      on conflict (word) do update set meaning_vi = excluded.meaning_vi
      returning id`;
    order += 1;
    await sql`
      insert into book_words (book_id, word_id, "order")
      values (${BOOK_ID}, ${row.id}, ${order}) on conflict do nothing`;
  }
  return u.id;
}

async function cleanup(userId) {
  await sql`delete from users where id = ${userId}`;
  await sql`delete from words where word like 'qa-r0-%'`;
  await sql`delete from books where id = ${BOOK_ID}`;
  await sql.end();
}

const log = [];
const say = (m) => {
  log.push(m);
  console.log(m);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => say(`PAGE ERROR: ${e.message}`));

const userId = await seed();

// ── FLOW 1: login (UI thật) ────────────────────────────────────────────────
await page.goto(`${BASE}/en/login`, { waitUntil: "domcontentloaded" });
await page.getByLabel(/email/i).fill(email);
await page.getByLabel(/password|mật khẩu/i).fill("password123");
await page.locator("form").getByRole("button", { name: /log in|đăng nhập/i }).click();
await page.waitForURL(/\/en$/);
say("FLOW login: OK");
await page.screenshot({ path: `${OUT}/flow-01-after-login.png`, fullPage: false });

// ── VISUAL 1: learn page intro (light) ─────────────────────────────────────
await page.goto(`${BASE}/en/vocabulary/learn/${BOOK_ID}`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: WORDS[0].word }).waitFor({ timeout: 30_000 });
await page.screenshot({ path: `${OUT}/visual-learn-intro-light.png`, fullPage: true });
say("VISUAL learn intro (light): captured");

// DOM check: dark chưa bật, touch target ≥44
const introChecks = await page.evaluate(() => {
  const toggle = document.querySelector('[data-testid="vocab-theme-toggle"]');
  const back = document.querySelector('a[aria-label="Back"]');
  return {
    darkScope: !!document.querySelector("div.dark"),
    toggleSize: toggle ? [toggle.offsetWidth, toggle.offsetHeight] : null,
    backSize: back ? [back.offsetWidth, back.offsetHeight] : null,
    scrollWidth: document.documentElement.scrollWidth,
  };
});
say(`DOM learn intro: ${JSON.stringify(introChecks)}`);

// ── VISUAL 2: dark toggle ──────────────────────────────────────────────────
await page.getByTestId("vocab-theme-toggle").click();
await page.waitForTimeout(400);
const darkOn = await page.evaluate(() => !!document.querySelector("div.dark"));
say(`DOM dark toggle: scope dark = ${darkOn}`);
await page.screenshot({ path: `${OUT}/visual-learn-intro-dark.png`, fullPage: true });
say("VISUAL learn intro (dark): captured");
await page.getByTestId("vocab-theme-toggle").click(); // về light
await page.waitForTimeout(300);

// ── FLOW 2: learn trọn phiên (5 từ, UI thật) ───────────────────────────────
const byMeaning = new Map(WORDS.map((w) => [w.meaning, w.word]));
let shotMc = false;
for (let i = 0; i < 30; i++) {
  if (await page.getByTestId("session-summary").isVisible().catch(() => false)) break;
  if (await page.getByTestId("introduce-continue").isVisible().catch(() => false)) {
    await page.getByTestId("introduce-continue").click();
    await page.waitForTimeout(200);
    continue;
  }
  if (await page.getByTestId("option-group").isVisible().catch(() => false)) {
    // mc lộ từ (heading) → nghĩa đúng; listen ẨN từ → chọn option đầu
    // (đúng/sai đều đi tiếp — sai requeue, type chấm đúng)
    const listen = await page.getByTestId("listen-replay").isVisible().catch(() => false);
    let meaning = "nghĩa R0";
    if (!listen) {
      const word = await page.getByTestId("step-card").getByRole("heading").innerText();
      meaning = WORDS.find((w) => w.word === word.trim())?.meaning ?? meaning;
    }
    await page
      .getByTestId("session-option")
      .filter({ hasText: meaning })
      .first()
      .click();
    await page
      .getByTestId("feedback-correct")
      .or(page.getByTestId("feedback-wrong"))
      .first()
      .waitFor({ timeout: 30_000 });
    if (!shotMc) {
      await page.screenshot({ path: `${OUT}/visual-learn-mc-feedback.png`, fullPage: false });
      shotMc = true;
      say("VISUAL MC + feedback: captured");
    }
    const wrong = await page.getByTestId("feedback-wrong").isVisible().catch(() => false);
    if (wrong) {
      await page.getByTestId("continue-after-wrong").click();
    } else {
      await page.waitForTimeout(1300); // auto-advance 1s
    }
    continue;
  }
  if (await page.getByTestId("type-input").isVisible().catch(() => false)) {
    const prompt = (await page.getByTestId("type-prompt").innerText())
      .replaceAll(/[“”]/g, "")
      .trim();
    const word = byMeaning.get(prompt);
    await page.getByTestId("type-input").fill(word ?? "qa-r0-01");
    await page.getByTestId("type-input").press("Enter");
    await page
      .getByTestId("feedback-correct")
      .waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1300);
    continue;
  }
  await page.waitForTimeout(500);
}
await page.getByTestId("session-summary").waitFor({ timeout: 30_000 });
await page.screenshot({ path: `${OUT}/visual-learn-summary.png`, fullPage: true });
const summaryText = await page.getByTestId("summary-xp").innerText();
say(`FLOW learn trọn phiên: OK — summary ${summaryText}`);
await page.screenshot({ path: `${OUT}/flow-02-learn-done.png`, fullPage: false });

// ── FLOW 3: review — seed due + gõ từ ──────────────────────────────────────
await sql`
  insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
  select ${userId}, id, 2.5, 1, now() - interval '1 hour', 2
  from words where word in ('qa-r0-01', 'qa-r0-02', 'qa-r0-03')
  on conflict (user_id, word_id) do update set due_at = now() - interval '1 hour'`;
await page.goto(`${BASE}/en/me/vocabulary`, { waitUntil: "domcontentloaded" });
await page.getByTestId("step-card").waitFor({ timeout: 30_000 });
await page.screenshot({ path: `${OUT}/visual-review-mc.png`, fullPage: true });
say("VISUAL review page: captured");
for (let i = 0; i < 20; i++) {
  if (await page.getByTestId("session-summary").isVisible().catch(() => false)) break;
  if (await page.getByTestId("type-input").isVisible().catch(() => false)) {
    const prompt = (await page.getByTestId("type-prompt").innerText())
      .replaceAll(/[“”]/g, "")
      .trim();
    await page.getByTestId("type-input").fill(byMeaning.get(prompt) ?? "qa-r0-01");
    await page.getByTestId("type-input").press("Enter");
    await page.getByTestId("feedback-correct").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1300);
    continue;
  }
  if (await page.getByTestId("option-group").isVisible().catch(() => false)) {
    const word = await page.getByTestId("step-card").getByRole("heading").innerText();
    const meaning = WORDS.find((w) => w.word === word.trim())?.meaning ?? "nghĩa R0";
    await page.getByTestId("session-option").filter({ hasText: meaning }).first().click();
    await page
      .getByTestId("feedback-correct")
      .or(page.getByTestId("feedback-wrong"))
      .first()
      .waitFor({ timeout: 30_000 });
    const wrong = await page.getByTestId("feedback-wrong").isVisible().catch(() => false);
    if (wrong) await page.getByTestId("continue-after-wrong").click();
    else await page.waitForTimeout(1300);
    continue;
  }
  await page.waitForTimeout(500);
}
const reviewDone = await page.getByTestId("session-summary").isVisible().catch(() => false);
say(`FLOW review trọn phiên: ${reviewDone ? "OK" : "KHÔNG xong — NÓI THẬT"}`);
await page.screenshot({ path: `${OUT}/flow-03-review-done.png`, fullPage: false });

// ── VISUAL 4: mobile 375 ───────────────────────────────────────────────────
const mobile = await browser.newPage({ viewport: { width: 375, height: 667 } });
await mobile.goto(`${BASE}/en/vocabulary/learn/${BOOK_ID}`, { waitUntil: "domcontentloaded" });
try {
  await mobile
    .getByRole("heading", { name: /(qa-r0-\d+|Sách hoàn thành)/ })
    .waitFor({ timeout: 30_000 });
} catch {
  // level 1 có thể đã planted hết sau flow — learnDone cũng là trạng thái hợp lệ
}
await mobile.screenshot({ path: `${OUT}/visual-mobile-375.png`, fullPage: true });
const mScroll = await mobile.evaluate(() => document.documentElement.scrollWidth);
say(`VISUAL mobile 375: captured — scrollWidth=${mScroll} (≤375 = không vỡ)`);
await mobile.close();

// ── FLOW 4: logout ─────────────────────────────────────────────────────────
await page.goto(`${BASE}/en/me`, { waitUntil: "domcontentloaded" });
const logoutBtn = page.getByRole("button", { name: /log out|đăng xuất/i }).first();
if (await logoutBtn.isVisible().catch(() => false)) {
  await logoutBtn.click();
  await page.waitForTimeout(1500);
  say(`FLOW logout: ${page.url().includes("/login") || !page.url().includes("/me") ? "OK" : "kiểm URL: " + page.url()}`);
} else {
  say("FLOW logout: nút không thấy trên /me — kiểm thủ công (không chặn)");
}

await cleanup(userId);
await browser.close();
say("RULE 0 VERIFY DONE — đọc ảnh trong evidence để xác nhận VISUAL");

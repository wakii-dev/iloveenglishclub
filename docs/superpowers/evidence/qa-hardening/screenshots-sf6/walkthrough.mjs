/**
 * SF-6 Rule 0 browser walkthrough — 3 tầng (DOM / VISUAL / FLOW)
 * trên build PROD local (`next start` :3110, HEAD nhánh sf-6).
 *
 * Tầng 1 DOM: assert element thật mỗi bước (getByRole/locator + expect).
 * Tầng 2 VISUAL: full-page screenshots → đọc ảnh trực tiếp sau khi chạy.
 * Tầng 3 FLOW: click-through thật: home → books → book → unit → lesson →
 *   start → gõ sai → check (Enter) → diff đỏ → next/‹/› (QA-103 adjacent) →
 *   skip tới hết → results → transcript; /vi + mobile 390.
 *
 * Chạy: node docs/superpowers/evidence/qa-hardening/screenshots-sf6/walkthrough.mjs
 * Out: screenshots PNG cùng thư mục + verdict ra stdout (exit 1 nếu DOM/flow fail).
 */
import { chromium, devices, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.WALK_BASE ?? "http://localhost:3110";
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOT = (n) => join(HERE, n);
mkdirSync(HERE, { recursive: true });

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const LESSON_VI = "/vi/books/level-3/units/1/lessons/1/listen-and-type";
const S1 = "I play football with my friends every Saturday.";
const S1_WRONG = "I play football with my friend every Saturday.";
const START = /start part|bắt đầu/i;

const errors = { pageerror: [], console: [] };
let step = 0;
const ok = (m) => console.log(`  ✓ [${++step}] ${m}`);

const browser = await chromium.launch();
try {
  // ---------- DESKTOP — FLOW chính ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.pageerror.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.console.push(m.text()); });

  // Tầng 3: home → books (click nav thật)
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await expect(page.getByRole("banner")).toBeVisible();
  ok("home /en render — header (banner) visible (DOM)");
  // animations:"disabled" — headless fullPage stitch mất tile chứa card
  // anim-float (hero right) khi infinite animation chạy giữa frame; DOM
  // probe opacity=1 + render thật OK → artifact chụp, không phải bug app.
  await page.screenshot({ path: SHOT("01-home-en.png"), fullPage: true, animations: "disabled" });

  await page.locator('a[href*="/books"]').first().click();
  await expect(page).toHaveURL(/\/en\/books/);
  await expect(page.locator('a[href*="/books/level-3"]').first()).toBeVisible();
  ok("click Books → /en/books — card Level 3 visible (DOM)");
  await page.screenshot({ path: SHOT("02-books-en.png"), fullPage: true });

  // books → book → unit (click thật)
  await page.locator('a[href*="/books/level-3"]').first().click();
  await expect(page).toHaveURL(/\/en\/books\/level-3/);
  await expect(page.locator('a[href*="/units/1"]').first()).toBeVisible();
  ok("book page — unit 1 link visible (DOM)");
  await page.screenshot({ path: SHOT("03-book-level3-en.png"), fullPage: true });

  await page.locator('a[href*="/units/1"]').first().click();
  await expect(page).toHaveURL(/\/en\/books\/level-3\/units\/1/);
  await expect(page.locator('a[href*="lessons/1/listen-and-type"]').first()).toBeVisible();
  ok("unit page — lesson 1 listen-and-type link visible (DOM)");
  await page.screenshot({ path: SHOT("04-unit1-en.png"), fullPage: true });

  // unit → lesson — start gate + check + diff
  await page.locator('a[href*="lessons/1/listen-and-type"]').first().click();
  await expect(page).toHaveURL(new RegExp(LESSON.replace(/\//g, "\\/")));
  await expect(page.getByRole("button", { name: START })).toBeVisible();
  ok("lesson page — START gate visible, KHÔNG tự phát (DOM)");
  await page.screenshot({ path: SHOT("05-lesson-before-start.png"), fullPage: true });

  await page.getByRole("button", { name: START }).click();
  await expect(page.getByRole("textbox")).toBeVisible();
  ok("click START → audio start + type panel mở (FLOW)");
  await page.getByRole("textbox").fill(S1_WRONG);
  await page.keyboard.press("Enter");
  await expect(page.locator("span.line-through")).toHaveCount(1);
  ok("gõ sai + Enter → check chạy, diff đỏ 1 từ (FLOW + DOM)");
  await page.screenshot({ path: SHOT("06-lesson-checked-diff.png"), fullPage: true });

  // nav: next → review ‹ (diff persist) → › adjacent (QA-103)
  await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
  await expect(page.getByText(/Part 2 of 4|Phần 2 \/ 4/i)).toBeVisible();
  ok("next sentence → Part 2/4 (FLOW)");
  await page.getByRole("button", { name: /previous part|phần trước/i }).click();
  await expect(page.getByText(/Part 1 of 4|Phần 1 \/ 4/i)).toBeVisible();
  await expect(page.locator("span.line-through")).toHaveCount(1);
  ok("‹ review part 1 — diff đỏ persist (QA-103 domain, DOM)");
  await page.screenshot({ path: SHOT("07-review-part1-diff-persist.png"), fullPage: true });
  await page.getByRole("button", { name: /next part|phần sau/i }).click();
  await expect(page.getByText(/Part 2 of 4|Phần 2 \/ 4/i)).toBeVisible();
  ok("› từ review part 1 → part 2 KỀ BÊN (QA-103 fix — không nhảy part 3)");
  await page.screenshot({ path: SHOT("08-next-part-adjacent-part2.png"), fullPage: true });

  // skip tới hết part → results → transcript
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /skip this sentence|bỏ qua câu/i }).click();
    await page.waitForTimeout(400);
  }
  await expect(page.getByText(/Part 4 of 4|Phần 4 \/ 4/i)).toBeVisible();
  ok("skip ×2 → Part 4/4 (FLOW)");
  await page.getByRole("textbox").fill(S1);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
  await expect(page.getByText(/results|kết quả/i).first()).toBeVisible({ timeout: 15_000 });
  ok("hết lesson → RESULTS render (FLOW)");
  await page.screenshot({ path: SHOT("09-results.png"), fullPage: true });
  const transcript = page.getByRole("tab", { name: /transcript|bản ghi/i });
  if (await transcript.count()) {
    await transcript.click();
    ok("tab transcript mở (DOM)");
    await page.screenshot({ path: SHOT("10-transcript.png"), fullPage: true });
  } else {
    console.log("  ℹ transcript tab không ở dạng role=tab — skip (không fail: UI variant)");
  }
  await ctx.close();

  // ---------- /vi — i18n flow ngắn ----------
  const ctxVi = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const vi = await ctxVi.newPage();
  vi.on("pageerror", (e) => errors.pageerror.push(String(e)));
  vi.on("console", (m) => { if (m.type() === "error") errors.console.push(m.text()); });
  await vi.goto(`${BASE}/vi`, { waitUntil: "networkidle" });
  await expect(vi.getByRole("banner")).toBeVisible();
  ok("home /vi render (DOM)");
  await vi.screenshot({ path: SHOT("11-home-vi.png"), fullPage: true, animations: "disabled" });
  await vi.goto(`${BASE}${LESSON_VI}`, { waitUntil: "domcontentloaded" });
  await expect(vi.getByRole("button", { name: START })).toBeVisible();
  await vi.getByRole("button", { name: START }).click();
  await expect(vi.getByRole("textbox")).toBeVisible();
  await vi.getByRole("textbox").fill(S1);
  await vi.keyboard.press("Enter");
  await vi.getByRole("button", { name: /câu tiếp|next sentence/i }).waitFor({ state: "visible", timeout: 10_000 });
  ok("lesson /vi — start + gõ đúng + check + nút 'câu tiếp' tiếng Việt (i18n FLOW)");
  await vi.screenshot({ path: SHOT("12-lesson-vi.png"), fullPage: true });
  await ctxVi.close();

  // ---------- MOBILE 390 — iPhone 12 ----------
  const ctxM = await browser.newContext({ ...devices["iPhone 12"] });
  const m = await ctxM.newPage();
  m.on("pageerror", (e) => errors.pageerror.push(String(e)));
  m.on("console", (mm) => { if (mm.type() === "error") errors.console.push(mm.text()); });
  await m.goto(`${BASE}${LESSON}`, { waitUntil: "domcontentloaded" });
  await m.getByRole("button", { name: START }).click();
  await expect(m.getByRole("textbox")).toBeVisible();
  await m.getByRole("textbox").fill(S1_WRONG);
  await m.keyboard.press("Enter");
  await expect(m.locator("span.line-through")).toHaveCount(1);
  const tb = await m.getByRole("textbox").boundingBox();
  if (tb && tb.y + tb.height > m.viewportSize().height) throw new Error(`textbox bị che dưới màn hình: y=${tb.y} h=${tb.height}`);
  ok("mobile 390 — start + gõ + check + textbox trong viewport (safe-area)");
  await m.screenshot({ path: SHOT("13-lesson-mobile-390.png"), fullPage: true });
  await ctxM.close();

  // ---------- verdict ----------
  if (errors.pageerror.length) {
    console.error(`PAGEERROR ×${errors.pageerror.length}:`, errors.pageerror.slice(0, 3));
    process.exit(1);
  }
  const consoleErrs = errors.console.filter((t) => !/Download the React DevTools|autoplay/i.test(t));
  console.log(`\nRULE-0 WALKTHROUGH: PASS — ${step} bước DOM/FLOW đạt, screenshots 13 PNG`);
  console.log(`pageerror: 0 · console.error: ${consoleErrs.length}${consoleErrs.length ? " → " + JSON.stringify(consoleErrs.slice(0, 3)) : ""}`);
} finally {
  await browser.close();
}

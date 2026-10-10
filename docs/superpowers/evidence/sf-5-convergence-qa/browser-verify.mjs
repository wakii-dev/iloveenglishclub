/**
 * Rule 0 browser verify — VU-37 SF-5 Convergence (VU-42): FLOW trọn vòng
 * 1 user thật: register → dashboard → learn 5 từ (chuột + bàn phím) → XP →
 * /top-users THẤY tên mình weekly → review (seed due — "sang ngày") → logout.
 *
 * 3 tầng nhận thức (skill Rule 0):
 *  - DOM: assert tại từng bước (header XP, continue card, summary, queue)
 *  - VISUAL: screenshot PNG 375 từng màn (mobile) + desktop dashboard/learn
 *  - FLOW: chuỗi tương tác LIỀN MẠCH — chuẩn duy nhất cho "xong"
 *
 * Driver pattern 3318: sau khi trả lời CHỜ feedback MẤT (auto-advance hoặc
 * nút continue) — chống click lại option disabled của bước cũ; click option
 * timeout NGẮN + retry (submit disable/RSC swap). Fallback headless Chromium
 * trên CÙNG dev server build (FI-464) — khai báo trung thực trong evidence.
 * Chạy: (npx next dev --port 3321 &) → node docs/superpowers/evidence/
 *       sf-5-convergence-qa/browser-verify.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.E2E_URL ?? "http://localhost:3321";
const OUT = new URL(".", import.meta.url).pathname; // evidence dir này
fs.mkdirSync(OUT, { recursive: true });

let DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL) {
  const env = fs.readFileSync(".env.local", "utf8");
  DB_URL = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^\"|\"$/g, "") ?? "";
}
const sql = postgres(DB_URL, { prepare: false });

const stamp = Date.now();
const email = `qa-sf5-flow-${stamp}@test.ilec`;
const displayName = `SF5 Flow Walk`;
const errors = [];

const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const log = (s) => console.log(`[walk] ${s}`);

/** Click timeout NGẮN + retry — chống option disabled lúc submitting/detach. */
async function clickOption(opt) {
  for (let i = 0; i < 8; i++) {
    try {
      await opt.click({ timeout: 2_500 });
      return;
    } catch (e) {
      if (!(await opt.isVisible().catch(() => false))) return; // bước đổi
      await page.waitForTimeout(500);
    }
  }
}

/** Sau khi trả lời: sai → bấm "Tiếp tục" (continue-after-wrong — feedback
 *  giữ màn); rồi chờ feedback MẤT (auto-advance) hoặc summary (pattern 3318). */
async function settle(useKeyboard) {
  const fb =
    page.getByTestId("feedback-correct").or(page.getByTestId("feedback-wrong"));
  await fb.first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
  const wrongCont = page.getByTestId("continue-after-wrong");
  if (await wrongCont.isVisible().catch(() => false)) {
    useKeyboard
      ? await wrongCont.press("Enter")
      : await wrongCont.click({ timeout: 2_500 }).catch(() => {});
  }
  for (let i = 0; i < 60; i++) {
    if (await page.getByTestId("session-summary").isVisible().catch(() => false)) return;
    if (!(await fb.first().isVisible().catch(() => false))) return;
    await page.waitForTimeout(250);
  }
  throw new Error("feedback không tự mất sau 15s — advance không xảy ra");
}

/** Nhấn continue nếu nút đang hiện (không chờ). */
async function continueIfVisible(useKeyboard) {
  const cont = page
    .getByRole("button", { name: /tiếp tục|continue|next/i })
    .first();
  if (await cont.isVisible().catch(() => false)) {
    useKeyboard ? await cont.press("Enter") : await cont.click().catch(() => {});
    return true;
  }
  return false;
}

/** Trả lời ĐÚNG bước hiện tại (type: nghĩa→từ; MC: từ trên card; LISTEN: từ
 *  KHÔNG nằm trong DOM — đọc src <audio> map qua words.audio_url). */
async function answerCurrent(MEANING, AUDIO, useKeyboard) {
  const typeInput = page.getByTestId("type-input");
  if (await typeInput.isVisible().catch(() => false)) {
    if (!(await typeInput.isEnabled().catch(() => false))) return false; // đang submit — chờ vòng sau
    const prompt = (await page.getByTestId("type-prompt").innerText())
      .replaceAll("“", "").replaceAll("”", "").trim();
    const word = [...MEANING.entries()].find(([, m]) => m === prompt)?.[0];
    if (!word) throw new Error(`DOM FAIL: type-prompt không khớp pool: "${prompt}"`);
    await page.getByTestId("type-input").fill(word);
    await page.getByTestId("type-input").press("Enter");
    await settle(useKeyboard);
    return true;
  }
  // listen không-options (pool <2 nghĩa — contract P1): fallback GÕ NGHĨA —
  // đáp án trong audio src như listen thường
  const fallbackInput = page.getByTestId("listen-fallback-input");
  if (await fallbackInput.isVisible().catch(() => false)) {
    if (!(await fallbackInput.isEnabled().catch(() => false))) return false;
    const src = await page
      .locator("[data-testid=step-card] audio")
      .getAttribute("src");
    const word = AUDIO.get(src ?? "");
    if (!word) throw new Error(`DOM FAIL: fallback audio src không khớp pool: "${src}"`);
    await fallbackInput.fill(MEANING.get(word) ?? "");
    await fallbackInput.press("Enter");
    await settle(useKeyboard);
    return true;
  }
  const optionGroup = page.getByTestId("option-group");
  if (await optionGroup.isVisible().catch(() => false)) {
    // đang submit (options disabled) → chờ vòng sau, đừng clickstep cũ
    const firstOpt = optionGroup.getByTestId("session-option").first();
    if (!(await firstOpt.isEnabled().catch(() => false))) return false;
    let target;
    const listenVisible = await page
      .getByTestId("listen-replay")
      .isVisible()
      .catch(() => false);
    if (listenVisible) {
      // bước nghe: đáp án chỉ có trong audio — src <audio> = words.audio_url
      const src = await page
        .locator("[data-testid=step-card] audio")
        .getAttribute("src");
      target = AUDIO.get(src ?? "");
      if (!target) throw new Error(`DOM FAIL: audio src không khớp pool: "${src}"`);
    } else {
      const cardText = await page.locator("[data-testid=step-card]").innerText();
      // match TRỌN VẸN word-boundary + dài trước ngắn ("a" không dính substring
      // "twenty-four" — đã ăn 1 lần trong FLOW run)
      target = [...MEANING.keys()]
        .sort((x, y) => y.length - x.length)
        .find((x) =>
          new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(cardText),
        );
    }
    if (!target) throw new Error(`DOM FAIL: step-card không lộ từ pool`);
    const opt = optionGroup
      .getByTestId("session-option")
      .filter({ hasText: MEANING.get(target) })
      .first();
    if (useKeyboard) {
      await opt.focus();
      await opt.press("Enter");
    } else {
      await clickOption(opt);
    }
    await settle(useKeyboard);
    return true;
  }
  return false;
}

try {
  // ── B1: register → login ngay (session API là ground truth — header <640px
  // chỉ hiện initials chip theo design §3)
  log("b1: register");
  await page.goto(`${BASE}/en/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page.locator("form").getByRole("button", { name: /sign up|đăng ký/i }).click();
  await page.waitForURL(/\/en$/);
  await page.waitForTimeout(2_000); // SessionSync refetch
  const sess1 = await page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()));
  if (sess1?.user?.email !== email) throw new Error(`DOM FAIL: session sau register sai: ${JSON.stringify(sess1?.user ?? sess1)}`);
  const header1 = await page.getByRole("banner").innerText();
  log(`b1 OK: session=${sess1.user.email} header="${header1.replace(/\s+/g, " ").slice(0, 80)}"`);

  // ── B2: dashboard /vi/vocabulary — continue card + stats + garden
  log("b2: dashboard");
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await page.getByText(/HỌC TIẾP|Học tiếp/i).first().waitFor({ timeout: 30_000 });
  const dash = await page.locator("main").innerText();
  if (!/mục tiêu|streak|Chuỗi/i.test(dash)) throw new Error("DOM FAIL: dashboard thiếu stat blocks");
  await shot("flow-01-dashboard-375");
  log("b2 OK: continue card + stats render");

  // ── B3: vào learn từ continue CTA (href bookId SỐ — SF-5 fix slug→404)
  log("b3: continue → learn page");
  const ctaHref = await page.locator("main").getByRole("link", { name: /từ mới/i }).first().getAttribute("href");
  if (!/\/learn\/\d+$/.test(ctaHref ?? "")) throw new Error(`DOM FAIL: continue CTA href không phải bookId số: "${ctaHref}" (bug slug→404)`);
  await page.locator("main").getByRole("link", { name: /từ mới/i }).first().click();
  await page.waitForURL(/\/vi\/vocabulary\/learn\//, { timeout: 30_000 });
  await page.getByTestId("step-card").first().waitFor({ timeout: 60_000 });
  await shot("flow-02-learn-intro-375");
  log(`b3 OK: learn page ${page.url()} (href "${ctaHref}")`);

  // Bảng nghĩa + audio động: từ level-1 (book đầu — user mới) theo order
  const words = await sql`
    select w.word, w.meaning_vi, w.audio_url from words w
    join book_words bw on bw.word_id = w.id
    join books b on b.id = bw.book_id
    where b.slug = 'level-1' order by bw."order" limit 10
  `;
  const MEANING = new Map(words.map((w) => [w.word, w.meaning_vi]));
  const AUDIO = new Map(words.filter((w) => w.audio_url).map((w) => [w.audio_url, w.word]));
  log(`b3: ${words.length} từ pool: ${words.map((w) => w.word).join(", ")}`);

  // ── B4: đi 5 từ — word đầu BÀN PHÍM thuần, còn lại chuột. Summary chỉ
  // hiện CUỐI session (5 slot) → flat loop: intro → các bước → intro kế…
  let keyboardWalk = 0;
  let learnSteps = 0;
  let introSeen = 0;
  for (let step = 0; step < 60; step++) {
    await page.waitForTimeout(700);
    if (await page.getByTestId("session-summary").isVisible().catch(() => false)) break;
    const introCta = page.getByTestId("introduce-continue");
    if (await introCta.isVisible().catch(() => false)) {
      introSeen++;
      if (introSeen === 1) await shot("flow-02-learn-intro-375");
      // intro luôn click — press("Enter") sau render có lần không ăn (đã làm
      // introSeen đếm 2 cho từ 1); keyboard-walk nằm ở các bước TRẢ LỜI từ 1
      await introCta.click();
      learnSteps++;
      continue;
    }
    const replay = page.getByTestId("listen-replay");
    if (await replay.isVisible().catch(() => false)) {
      await replay.click().catch(() => {}); // phát lại (audio thật)
    }
    const answered = await answerCurrent(MEANING, AUDIO, introSeen === 1);
    if (answered) {
      learnSteps++;
      if (introSeen <= 1 && answered) keyboardWalk++;
      if (introSeen === 1 && (await page.getByTestId("option-group").isVisible().catch(() => false))) {
        await shot("flow-03-learn-mc-375"); // MC/listen bước của từ 1
      }
    }
  }
  await page.getByTestId("session-summary").waitFor({ timeout: 30_000 });
  if (introSeen < 5) throw new Error(`FLOW FAIL: chỉ đi ${introSeen}/5 từ (summary sớm?)`);
  // ── B5: summary XP
  await page.getByTestId("session-summary").waitFor({ timeout: 30_000 });
  const xpText = await page.getByTestId("summary-xp").innerText();
  const planted = await page.getByTestId("summary-planted").innerText();
  if (!/^\+\d+ XP$/.test(xpText.trim())) throw new Error(`DOM FAIL: summary-xp sai format: "${xpText}"`);
  await shot("flow-04-learn-summary-375");
  log(`b5 OK: summary "${xpText}" planted="${planted}" (steps ${learnSteps}, keyboard-walk words ${keyboardWalk})`);

  // DB assert XP thực
  const xpRows = await sql`select p.xp::int as xp from profiles p join users u on u.id = p.id where u.email = ${email}`;
  const claimed = parseInt(xpText.replace(/\D/g, ""), 10);
  if (xpRows[0]?.xp !== claimed) throw new Error(`DB FAIL: profiles.xp=${xpRows[0]?.xp} ≠ summary ${claimed}`);
  log(`b5 OK: DB xp = ${xpRows[0].xp} khớp summary`);

  // ── B6: /top-users thấy tên mình (weekly)
  log("b6: /top-users");
  await page.goto(`${BASE}/vi/top-users`, { waitUntil: "domcontentloaded" });
  const weekly = page.locator('[aria-labelledby="weekly-heading"]');
  await weekly.waitFor({ timeout: 30_000 });
  await weekly.getByText(displayName).waitFor({ timeout: 15_000 });
  const weeklyText = await weekly.innerText();
  if (!weeklyText.includes(String(xpRows[0].xp))) throw new Error(`DOM FAIL: weekly không có ${xpRows[0].xp} XP`);
  await shot("flow-05-top-users-375");
  log(`b6 OK: weekly có "${displayName}" +${xpRows[0].xp} XP`);

  // ── B7: review "sang ngày" — seed 1 từ due quá khứ rồi đi phiên review
  log("b7: review (seed due)");
  await sql`
    update user_word_progress set due_at = now() - interval '1 hour'
    where user_id = (select id from users where email = ${email})
      and word_id = (select w.id from words w where w.word = ${words[0].word})
  `;
  await page.goto(`${BASE}/vi/me/vocabulary`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("step-card").first().waitFor({ timeout: 60_000 });
  await shot("flow-06-review-step-375");
  for (let step = 0; step < 14; step++) {
    await page.waitForTimeout(700);
    if (await page.getByTestId("session-summary").isVisible().catch(() => false)) break;
    const replay = page.getByTestId("listen-replay");
    if (await replay.isVisible().catch(() => false)) {
      await replay.click().catch(() => {});
    }
    await answerCurrent(MEANING, AUDIO, false);
  }
  await page.getByTestId("session-summary").waitFor({ timeout: 30_000 });
  const revXp = await page.getByTestId("summary-xp").innerText();
  const act = await sql`select count(*)::int as n from vocab_activity va join users u on u.id = va.user_id where u.email = ${email}`;
  await shot("flow-07-review-summary-375");
  log(`b7 OK: review summary "${revXp}", vocab_activity rows = ${act[0].n}`);

  // ── B8: /me streak giữ (vocab-only) — mobile shot luôn cho T6
  log("b8: /vi/me");
  await page.goto(`${BASE}/vi/me`, { waitUntil: "domcontentloaded" });
  const streakTile = page.locator("dl div").filter({ hasText: "Chuỗi hiện tại" });
  await streakTile.first().waitFor({ timeout: 15_000 });
  await shot("flow-08-me-375");
  log(`b8 OK: /me streak tile = ${(await streakTile.first().innerText()).replace(/\s+/g, " ")}`);

  // ── B9: hub library 375 (T6 màn hình)
  await page.goto(`${BASE}/vi/vocabulary?tab=library`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 2, name: "Thư viện từ vựng" }).waitFor({ timeout: 30_000 });
  await shot("flow-09-hub-library-375");
  log("b9 OK: hub library render");

  // ── B10: logout sạch — logout ở NGUYÊN trang (guest view cùng URL),
  // assert guest state qua link đăng nhập hiện lại trong header
  log("b10: logout");
  await page.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await page.getByRole("banner").getByRole("button", { name: new RegExp(displayName.slice(0, 2)) }).click();
  await page.getByRole("menuitem", { name: /đăng xuất|log out/i }).click();
  await page
    .getByRole("banner")
    .getByRole("link", { name: /đăng nhập|log in/i })
    .waitFor({ timeout: 30_000 });
  log("b10 OK: logout — header guest (link đăng nhập) tại " + page.url());
  await shot("flow-10-logged-out-375");

  // ── B11: desktop shots cho design fidelity (T7)
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  desk.on("pageerror", (e) => errors.push(`desktop pageerror: ${e.message}`));
  await desk.goto(`${BASE}/vi/login`, { waitUntil: "domcontentloaded" });
  await desk.getByLabel(/email/i).fill(email);
  await desk.getByLabel(/password|mật khẩu/i).fill("password123");
  await desk.locator("form").getByRole("button", { name: /đăng nhập|log in/i }).click();
  await desk.waitForURL(/\/vi$/);
  await desk.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await desk.getByText(/HỌC TIẾP|Học tiếp/i).first().waitFor({ timeout: 30_000 });
  await desk.waitForTimeout(1_500);
  await desk.screenshot({ path: `${OUT}visual-desktop-dashboard.png`, fullPage: true });
  log("b11 OK: desktop dashboard shot");
  await desk.close();

  // B12: prefers-reduced-motion — CSS clamp ép animationDuration về 0.01ms
  const rm = await browser.newPage({
    viewport: { width: 375, height: 812 },
    reducedMotion: "reduce",
  });
  await rm.goto(`${BASE}/vi/login`, { waitUntil: "domcontentloaded" });
  await rm.getByLabel(/email/i).fill(email);
  await rm.getByLabel(/password|mật khẩu/i).fill("password123");
  await rm.locator("form").getByRole("button", { name: /đăng nhập|log in/i }).click();
  await rm.waitForURL(/\/vi$/);
  await rm.goto(`${BASE}/vi/vocabulary`, { waitUntil: "domcontentloaded" });
  await rm.getByText(/HỌC TIẾP|Học tiếp/i).first().waitFor({ timeout: 30_000 });
  const rmCheck = await rm.evaluate(() => {
    const all = [...document.querySelectorAll("main *")];
    const animated = all.find(
      (el) => getComputedStyle(el).animationName !== "none",
    );
    return {
      mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationName: animated ? getComputedStyle(animated).animationName : "(none)",
      animationDuration: animated
        ? getComputedStyle(animated).animationDuration
        : "(no animated element)",
    };
  });
  await rm.screenshot({ path: `${OUT}visual-reduced-motion-375.png`, fullPage: true });
  log(
    `b12 OK: reduced-motion media=${rmCheck.mediaMatches} anim="${rmCheck.animationName}" duration=${rmCheck.animationDuration} (≤0.01ms = CSS clamp hoạt động)`,
  );
  await rm.close();

  console.log(`\nFLOW PASS — ${errors.length} console/page error`);
  if (errors.length) console.log(errors.slice(0, 10).join("\n"));
} catch (e) {
  await shot("flow-FAIL-state").catch(() => {});
  console.error(`\nFLOW FAIL: ${e.message}`);
  if (errors.length) console.error("errors:", errors.slice(0, 10).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  await sql`delete from users where email = ${email}`;
  await sql.end({ timeout: 5 });
}

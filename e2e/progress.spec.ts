import { expect, test, type Page } from "@playwright/test";
import {
  attemptCount,
  attemptCountFor,
  bumpProfileXpAboveMax,
  leaderboardWeeklyXpOf,
  profileOf,
} from "./db";

/**
 * E2E SF-6 (context pack #9 — plan-critic P1 tách khỏi SF-4): vòng lặp
 * progress đầy đủ.
 *  Test 1 (user đăng nhập): XP persist đúng công thức · học LẠI part → 0 XP
 *  thêm · Enter đôi nhanh → 1 attempt row (unique constraint) · /me stats +
 *  heatmap + book progress · /top-users 2 bảng.
 *  Test 2 (guest): học 2 câu → login GIỮA chừng qua banner ?next= → về
 *  lesson, in-memory commit (không mất điểm) → leaderboard có tên.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const SENT_1 = "I play football with my friends every Saturday.";
const SENT_2 = "She likes reading books in the library.";
const SENT_3 = "We watch a film at the weekend.";
const SENT_4 = "My brother goes swimming on Friday.";
const START = /start part|bắt đầu/i;

function uniqueEmail(tag: string): string {
  // tag chỉ còn ký tự email-an toàn + LOWERCASE: registerAction lowercases
  // email server-side — poll DB với email gốc mixed-case sẽ không bao giờ
  // match (bug đã ăn 5 lần run e2e trước khi instrument ra).
  return `sf6-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}@test.ilec`;
}

/** Đăng ký qua UI (auto sign-in, redirect /en). */
async function register(page: Page, displayName: string): Promise<string> {
  const email = uniqueEmail(displayName);
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  // Header cập nhật session NGAY sau redirect — fix 695f0ef (SessionSync
  // refetch trên pathname change); regression: progress-session-sync.spec.ts.
  // Workaround page.reload() đã BỎ (SF-3 task 4 — test trước, bỏ sau).
  return email;
}

/** Client-nav retry: click lại khi RSC re-render nuốt click (link đã active
 * nhưng navigation không hoàn tất — mid-RSC-swap class; lesson e2e-authoring:
 * click timeout NGẮN + .first()). */
async function clickNavUntil(
  page: Page,
  locator: ReturnType<Page["getByRole"]>,
  urlMatch: (u: URL) => boolean,
  urlDesc: string,
): Promise<void> {
  await expect(async () => {
    if (!urlMatch(new URL(page.url()))) {
      await locator.first().click({ timeout: 2_500 }).catch(() => {});
    }
    await page.waitForURL(urlMatch, { timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

/** Click Start + ĐỢI textbox — retry click khi rớt pre-hydration (lesson
 * e2e-authoring: click trước hydration bị nuốt, phase không chuyển). Click
 * timeout NGẮN để retry vòng sau; toPass chỏm 90s chịu compile lạnh. */
async function startPart(page: Page): Promise<void> {
  await expect(async () => {
    if (!(await page.getByRole("textbox").isVisible().catch(() => false))) {
      await page
        .getByRole("button", { name: START })
        .click({ timeout: 2_500 })
        .catch(() => {});
    }
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

/** Làm 1 part: gõ đúng → Enter check → Enter next. Enter advance có thể bị
 * nuốt khi RSC re-render (flake sweep: fill part kế timeout 360s) — retry
 * Enter khi feedback còn; dừng ngay khi feedback ẩn (đã advance, né Enter
 * thừa trong phase complete). */
async function doPartCorrect(page: Page, sentence: string): Promise<void> {
  await page.getByRole("textbox").fill(sentence);
  await page.keyboard.press("Enter"); // check
  const fb = page.getByText(/exactly right|chính xác/i);
  await expect(fb).toBeVisible();
  for (let i = 0; i < 4; i++) {
    if (!(await fb.isVisible().catch(() => false))) return;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
  }
}

/** Guest thật: clear cookie (signOut UI click có thể miss menu animation —
 *  đã tái hiện: session sống sót, guest submit như user). Auth flow là scope
 *  SF-1 — test SF-6 chỉ cần trạng thái guest deterministic. */
async function becomeGuest(page: Page): Promise<void> {
  await page.context().clearCookies();
  // TẮT CACHE (CDP): memory-cache hit /api/auth/session NÉ cả route handler —
  // sweep: useSession nhận response session CŨ thời register (header user
  // "0 XP" dù cookies đã clear — debug []). Cache off ⇒ fetch luôn network ⇒
  // không cookie ⇒ {} ⇒ guest thật; nửa sau-login của test hoạt động bình
  // thường (không cần unroute).
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
}

test.describe("Progress + Gamification (SF-6)", () => {
  // Dev server compile lạnh register/lesson/action → timeout rộng
  test.setTimeout(360_000);

  test("user: XP đúng · học lại 0 XP · Enter đôi = 1 attempt · /me · leaderboard", async ({
    page,
  }) => {
    const email = await register(page, "E2E Persist");

    // Header khởi điểm 0 XP (30s: server action my-stats compile lạnh lần đầu)
    const header = page.locator("header");
    await expect(header.getByText(/0 XP/)).toBeVisible({ timeout: 30_000 });

    // Part 1: gõ SAI ("friend" + thiếu dấu chấm → strict match 6/8 = 0.75)
    // → Enter đôi nhanh (2 lần liền, cùng text)
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await startPart(page);
    await page
      .getByRole("textbox")
      .fill("I play football with my friend every Saturday"); // acc 0.75
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // đôi nhanh — cùng text

    // ACCEPTANCE: chỉ 1 attempt được ghi (unique constraint + stable id).
    // Timeout 180s: server action compile lạnh lần đầu trên dev mới (~115s
    // đã đo); trên server warm poll thoát sau ~1s.
    await expect
      .poll(() => attemptCount(email, 1), { timeout: 180_000 })
      .toBe(1);

    // Sửa → check lại (đầy đủ dấu câu — strict mode) → attempt thứ 2 được
    // log nhưng 0 XP thêm
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
    await expect.poll(() => attemptCount(email, 1)).toBe(2);

    // XP = round(10 × 0.75) = 8 (chỉ attempt đầu) — header live
    await expect
      .poll(() => profileOf(email), { timeout: 30_000 })
      .toMatchObject({ xp: 8, streak: 1 });
    await expect(header.getByText(/^8 XP/)).toBeVisible({ timeout: 15_000 });

    // Part 2,3,4 đúng → +10 mỗi part (first attempt)
    await page.keyboard.press("Enter"); // next
    await doPartCorrect(page, SENT_2);
    await doPartCorrect(page, SENT_3);
    // part 4: check đúng → Enter cuối → Results
    await doPartCorrect(page, SENT_4);
    await expect(
      page.getByText(/great job|tuyệt vời/i).first(),
    ).toBeVisible();
    await expect
      .poll(() => profileOf(email))
      .toMatchObject({ xp: 38, streak: 1 });

    // Học LẠI toàn bài (Try again → doStart restart THẲNG vào part 1,
    // không qua start-gate — SF-4 behavior) → toàn bộ part đã có first
    // attempt → 0 XP thêm
    await page.getByRole("button", { name: /try again|làm lại/i }).click();
    await doPartCorrect(page, SENT_1);
    await doPartCorrect(page, SENT_2);
    await doPartCorrect(page, SENT_3);
    await expect
      .poll(() => profileOf(email))
      .toMatchObject({ xp: 38 }); // KHÔNG tăng

    // /me: stats + heatmap + book progress (assert theo card để khỏi khớp
    // sai số khác)
    await page.goto("/en/me", { waitUntil: "domcontentloaded" });
    const statCard = (label: RegExp) =>
      page.locator("dl > div", { hasText: label });
    await expect(statCard(/total xp|tổng xp/i)).toContainText("38");
    await expect(statCard(/parts practiced|phần đã luyện/i)).toContainText(
      "4",
    );
    await expect(statCard(/average accuracy|độ chính xác/i)).toContainText(
      "100%",
    );
    await expect(statCard(/listen time|thời gian nghe/i)).toContainText(
      /min|phút/,
    );
    // heatmap: ô hôm nay có title (≥4 phần)
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
    await expect(page.locator(`[title^="${today}"]`).first()).toBeVisible();
    // book L3: lesson demo done → ≥1 lesson
    await expect(
      page.getByText(/1\/\d+ lessons|1\/\d+ bài học/).first(),
    ).toBeVisible();

    // /top-users: 2 bảng đều có user với 38 XP
    // all-time top-50 guard: DB clone thật (ilec_dev nguồn) có sẵn 50+
    // profiles xp≥38 → user test rơi ngoài bảng KHÔNG phải regression —
    // bump XP user test lên trên max toàn nền (weekly vẫn 38 — đọc attempts)
    await bumpProfileXpAboveMax(email);
    await page.goto("/en/top-users", { waitUntil: "domcontentloaded" });
    const weekly = page.locator("section", {
      hasText: /this week|tuần này/i,
    });
    // nhiều run e2e tích tụ cùng displayName → .first() (đủ ACCEPTANCE:
    // user xuất hiện trong bảng)
    await expect(weekly.getByText("E2E Persist").first()).toBeVisible();
    const allTime = page.locator("section", {
      hasText: /all time|toàn thời gian/i,
    });
    await expect(allTime.getByText("E2E Persist").first()).toBeVisible();
    await expect(weekly.getByText("38").first()).toBeVisible();
  });

  test("P0 regression: học A → nav books → mở B → KHÔNG ghost-submit part B", async ({
    page,
  }) => {
    const email = await register(page, "E2E Ghost2");

    // Học part 1 lesson A (L3-U1-L1) → XP 10
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await startPart(page);
    await doPartCorrect(page, SENT_1);
    await expect
      .poll(() => profileOf(email), { timeout: 60_000 })
      .toMatchObject({ xp: 10 });

    // CLIENT-NAV toàn bộ sang lesson B (L3-U2-L1 "My day") — store singleton
    // sống qua navigation: mount B KHÔNG được submit part của B bằng state A
    await clickNavUntil(
      page,
      page.getByRole("link", { name: "Level 3" }),
      (u) => u.pathname === "/en/books",
      "/en/books",
    ); // breadcrumb → /books (danh sách)
    await clickNavUntil(
      page,
      page.getByRole("link", { name: /Level 3 A2/ }),
      (u) => u.pathname === "/en/books/level-3",
      "/en/books/level-3",
    ); // level-card → book page
    await clickNavUntil(
      page,
      page.getByRole("link", { name: /my day/i }),
      (u) => u.pathname === "/en/books/level-3/units/2",
      "/en/books/level-3/units/2",
    );
    // lesson-row: 2 link "Open" (theo thứ tự lesson) — lesson 1 là đích
    await clickNavUntil(
      page,
      page.getByRole("link", { name: "Open" }),
      (u) => u.pathname.endsWith("/units/2/lessons/1/listen-and-type"),
      "/units/2/lessons/1/listen-and-type",
    );

    // Lesson B render StartGate (không Results stale)
    await expect(page.getByRole("button", { name: START })).toBeVisible({
      timeout: 10_000,
    });

    // Part B chưa hề học → 0 attempt (đÚNG target U2-L1 part 1 — assert cũ
    // (3,1) nhắm U1-L3 không tồn tại trong seed → dead assert, review vòng 2)
    await page.waitForTimeout(4000);
    expect(await attemptCountFor(email, 1, 1, 2)).toBe(0);
    await expect
      .poll(() => profileOf(email))
      .toMatchObject({ xp: 10 });
  });

  test("guest học 2 câu → login giữa chừng → commit điểm, không mất", async ({
    page,
    browser,
  }) => {
    const email = await register(page, "E2E Guest");
    // guest phase dùng CONTEXT MỚI SẠCH TUYỆT ĐỐI (cookie/cache/storage 0) —
    // clearCookies + CDP cache-disable trên context cũ KHÔNG đủ: response
    // session-cũ thời register vẫn về tay useSession (header user 0 XP/20 XP
    // dù cookies [] — sweep lặp nhiều lần). Context mới = đúng mô hình
    // "trình duyệt khác chưa từng login".
    const guestCtx = await browser.newContext();
    const gpage = await guestCtx.newPage();
    try {
      await gpage.goto(LESSON, { waitUntil: "domcontentloaded" });
      await startPart(gpage);
      await doPartCorrect(gpage, SENT_1);
      await doPartCorrect(gpage, SENT_2);
      // chip +20 in-memory (acceptance guest-chip "not saved" pin riêng ở
      // progress-guest-commit A — ở đây chỉ cần XP in-memory đúng)
      const xpChip = gpage.locator("span", { hasText: /\+\s?20 XP/ }).first();
      await expect(xpChip).toBeVisible();
      await expect(gpage.getByRole("banner")).not.toContainText(/20 XP/);

      // Banner → login GIỮA chừng (?next quay lại lesson)
      await gpage
        .getByRole("link", { name: /log in|đăng nhập/i })
        .last()
        .click();
      // pathname predicate — chuỗi "listen-and-type" nằm ENCODED trong query
      // ?next= của chính trang login (false-positive đã ăn 2 lần)
      await gpage.waitForURL((u) => u.pathname.endsWith("/login"));
      expect(gpage.url()).toContain("next=");
      await gpage.getByLabel(/email/i).fill(email);
      await gpage.getByLabel(/password|mật khẩu/i).fill("password123");
      await gpage
        .locator("form")
        .getByRole("button", { name: /log in|đăng nhập/i })
        .click();

      // Về lại lesson — login redirect là FULL load: trang mới (snapshot
      // sessionStorage commit ngầm). Điểm phải sống: profile xp = 20.
      await gpage.waitForURL((u) => u.pathname.endsWith("/listen-and-type"));
      await expect
        .poll(() => profileOf(email), { timeout: 60_000 })
        .toMatchObject({ xp: 20, streak: 1 });
      await expect(
        gpage.getByText(/not saved|chưa lưu/i).first(),
      ).toHaveCount(0, { timeout: 15_000 });
      await expect(
        gpage.getByRole("banner").getByText(/20 XP/),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await guestCtx.close();
    }

    // Leaderboard tuần chứa XP user. UI /top-users LIMIT 50 — DB clone thật
    // có 323 users weekly (ngưỡng top-50 38 XP) → user 20 XP không vào bảng
    // là ĐÚNG hiển thị; acceptance "commit vào leaderboard" assert ở VIEW
    // (SQL) — đủ mọi DB, không phụ thuộc ngưỡng top-50.
    await expect
      .poll(() => leaderboardWeeklyXpOf(email), { timeout: 30_000 })
      .toBe(20);
  });
});

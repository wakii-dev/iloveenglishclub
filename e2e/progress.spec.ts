import { expect, test, type Page } from "@playwright/test";
import { attemptCount, attemptCountFor, profileOf } from "./db";

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
  // SessionProvider stale sau soft-redirect của server-action signIn (cookie
  // đã set nhưng useSession chưa refetch — header còn guest). Reload = user
  // thật F5; papercut SF-1 report coordinator, không fix trong SF-6.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/en$/);
  return email;
}

/** Làm 1 part: gõ đúng → Enter check → Enter next. */
async function doPartCorrect(page: Page, sentence: string): Promise<void> {
  await page.getByRole("textbox").fill(sentence);
  await page.keyboard.press("Enter"); // check
  await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
  await page.keyboard.press("Enter"); // next
}

/** Guest thật: clear cookie (signOut UI click có thể miss menu animation —
 *  đã tái hiện: session sống sót, guest submit như user). Auth flow là scope
 *  SF-1 — test SF-6 chỉ cần trạng thái guest deterministic. */
async function becomeGuest(page: Page): Promise<void> {
  await page.context().clearCookies();
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
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
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
    await page.getByRole("button", { name: START }).click();
    await doPartCorrect(page, SENT_1);
    await expect
      .poll(() => profileOf(email), { timeout: 60_000 })
      .toMatchObject({ xp: 10 });

    // CLIENT-NAV toàn bộ sang lesson B (L3-U2-L1 "My day") — store singleton
    // sống qua navigation: mount B KHÔNG được submit part của B bằng state A
    await page
      .getByRole("link", { name: "Level 3" })
      .first()
      .click(); // breadcrumb → /books (danh sách)
    await page.waitForURL((u) => u.pathname === "/en/books");
    await page
      .getByRole("link", { name: /Level 3 A2/ })
      .first()
      .click(); // level-card → book page
    await page.waitForURL((u) => u.pathname === "/en/books/level-3");
    await page.getByRole("link", { name: /my day/i }).first().click();
    await page.waitForURL((u) => u.pathname === "/en/books/level-3/units/2");
    // lesson-row: 2 link "Open" (theo thứ tự lesson) — lesson 1 là đích
    await page.getByRole("link", { name: "Open" }).first().click();
    await page.waitForURL((u) =>
      u.pathname.endsWith("/units/2/lessons/1/listen-and-type"),
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
  }) => {
    const email = await register(page, "E2E Guest");
    await becomeGuest(page);

    // Guest: học part 1 + 2 (in-memory, banner "chưa lưu")
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await doPartCorrect(page, SENT_1);
    await doPartCorrect(page, SENT_2);
    const xpChip = page.locator("span", { hasText: /\+\s?20 XP/ }).first();
    await expect(xpChip).toBeVisible();
    await expect(xpChip.getByText(/not saved|chưa lưu/i)).toBeVisible();
    await expect(page.getByRole("banner")).not.toContainText(/20 XP/);

    // Banner → login GIỮA chừng (?next quay lại lesson)
    await page.getByRole("link", { name: /log in|đăng nhập/i }).last().click();
    // pathname predicate — chuỗi "listen-and-type" nằm ENCODED trong query
    // ?next= của chính trang login (false-positive đã ăn 2 lần)
    await page.waitForURL((u) => u.pathname.endsWith("/login"));
    expect(page.url()).toContain("next=");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();

    // Về lại lesson — login redirect là FULL load: trang mới (snapshot
    // sessionStorage commit ngầm). Điểm phải sống: profile xp = 20.
    await page.waitForURL((u) => u.pathname.endsWith("/listen-and-type"));
    await expect
      .poll(() => profileOf(email), { timeout: 60_000 })
      .toMatchObject({ xp: 20, streak: 1 });
    await expect(
      page.getByText(/not saved|chưa lưu/i).first(),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("banner").getByText(/20 XP/),
    ).toBeVisible({ timeout: 30_000 });

    // Leaderboard tuần có tên user. SF-8 (prod-build smoke): /top-users là
    // ISR revalidate=60 — commit vừa xong chưa thấy ngay trong cache stale
    // (dev không cache nên cũ pass); poll reload ≤75s cho SWR kịp tái sinh.
    await expect
      .poll(async () => {
        await page.goto("/en/top-users", { waitUntil: "domcontentloaded" });
        return page
          .locator("section", { hasText: /this week|tuần này/i })
          .getByText("E2E Guest")
          .count();
      }, { timeout: 75_000, intervals: [5_000] })
      .toBeGreaterThan(0);
  });
});

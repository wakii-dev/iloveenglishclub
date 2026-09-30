import { expect, test, type Page } from "@playwright/test";
import { profileOf } from "./db";

/**
 * E2E SF-3 QA (context pack #11 — guest mid-lesson commit): mở rộng spec cũ
 * (progress.spec test 3 — commit đúng 20 XP). 3 góc mới:
 *  A. guest + relaxed: preview +5 XP (in-memory ×0.5) — drift khi commit là
 *     QA-202 (DEFERRED — server không tin client mode);
 *  B. commit IDEMPOTENT: sau mid-login commit, học lại part → XP không tăng;
 *  C. sessionStorage 1-tab BY-DESIGN: tab khác KHÔNG thấy điểm tab A (không
 *     "hồi sinh" điểm cá lạ — pending-commit.ts).
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const SENT_1 = "I play football with my friends every Saturday.";
const SENT_2 = "She likes reading books in the library.";
const START = /start part|bắt đầu/i;

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

async function doPartCorrect(page: Page, sentence: string): Promise<void> {
  await page.getByRole("textbox").fill(sentence);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
}

async function register(page: Page, displayName: string): Promise<string> {
  const email = sf3Email(displayName);
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  return email;
}

test.describe("Guest mid-lesson commit (SF-3)", () => {
  test.setTimeout(360_000);

  test("A: guest relaxed → preview chip +5 XP (in-memory, not saved)", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();

    await page.getByRole("button", { name: /^strict$/i }).click();
    await doPartCorrect(page, SENT_1);

    const chip = page.locator("span", { hasText: /\+\s?5 XP/ }).first();
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await expect(chip.getByText(/not saved|chưa lưu/i)).toBeVisible();
    // Banner vẫn guest (chưa lưu đâu cả)
    await expect(
      page.getByRole("banner").getByText(/log in|đăng nhập/i).first(),
    ).toBeVisible();
  });

  test("B: mid-login commit đúng → học lại part → XP KHÔNG tăng (idempotent)", async ({
    page,
  }) => {
    const email = await register(page, "SF3 Guest Idem");
    await page.context().clearCookies();

    // Guest: 2 part (in-memory +20)
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await doPartCorrect(page, SENT_1);
    await page.keyboard.press("Enter"); // next
    await doPartCorrect(page, SENT_2);

    // Login giữa chừng qua banner (?next về lesson)
    await page.getByRole("link", { name: /log in|đăng nhập/i }).last().click();
    await page.waitForURL((u) => u.pathname.endsWith("/login"));
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();
    await page.waitForURL((u) => u.pathname.endsWith("/listen-and-type"));
    await expect
      .poll(() => profileOf(email), { timeout: 60_000 })
      .toMatchObject({ xp: 20 });

    // Commit-on-mount RESTORE store (tiếp tục part 2, chip +20 đã saved) —
    // KHÔNG phải StartGate. Idempotency test: rời lesson → quay lại (session
    // mới) → snapshot ĐÃ POP nên KHÔNG commit kép → làm part 1 → XP giữ 20.
    await page.goto("/en/books", { waitUntil: "domcontentloaded" });
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await doPartCorrect(page, SENT_1);
    await expect
      .poll(() => profileOf(email), { timeout: 30_000 })
      .toMatchObject({ xp: 20 }); // không 30/40
  });

  test("C: sessionStorage 1-tab BY-DESIGN — tab khác không thấy điểm tab A", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await doPartCorrect(page, SENT_1);
    await page.keyboard.press("Enter");
    await doPartCorrect(page, SENT_2);
    await expect(
      page.locator("span", { hasText: /\+\s?20 XP/ }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Tab B cùng context (cùng guest — chưa login): store + sessionStorage
    // đều TRỐNG theo thiết kế (pending-commit.ts: sessionStorage = 1 tab)
    const tabB = await page.context().newPage();
    await tabB.goto(LESSON, { waitUntil: "domcontentloaded" });
    await tabB.getByRole("button", { name: START }).click();
    await expect(tabB.getByRole("textbox")).toBeVisible();
    await expect(
      tabB.locator("span", { hasText: /\+\s?20 XP/ }),
    ).toHaveCount(0);
    await tabB.close();
  });
});

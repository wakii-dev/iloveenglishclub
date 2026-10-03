import { expect, test, type Page } from "@playwright/test";
import { REVIEW_WORDS, seedDueProgress } from "./vocabulary-review-fixture";

/**
 * E2E review flow (story vocabulary-module SF-3 t-3.3): đăng ký user → seed
 * progress đến hạn (user_word_progress due 1h trước) → /me/vocabulary thấy
 * "Hôm nay cần ôn: N từ" → lật thẻ → chấm quality → POST /api/vocabulary/review
 * ghi SRS (reload đếm số due giảm = interval 1 ngày persist đúng) → ôn hết →
 * empty state. i18n vi/en. Fixture qa-review-* seed/tidy qua globalSetup/
 * teardown; bảng thiếu → globalSetup fail có hướng dẫn (không giả lập DB).
 */

const [ALPHA, BRAVO] = REVIEW_WORDS;

function qaEmail(tag: string): string {
  return `qa-review-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern progress-login.spec.ts) → trả email. */
async function registerUser(page: Page, displayName: string): Promise<string> {
  const email = qaEmail(displayName.replace(/[^a-z0-9]/gi, "").toLowerCase());
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

test.describe("Review flow (vocabulary SF-3)", () => {
  test.setTimeout(120_000);

  test("EN: due count → lật thẻ → Good → reload còn 1 due → Easy → empty", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Review EN");
    await seedDueProgress(email);

    await page.goto("/en/me/vocabulary");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Review vocabulary",
    );
    await expect(page.getByText(/2 words to review today/)).toBeVisible();

    // Thẻ 1 mặt trước: từ alpha + hint lật
    await expect(page.getByText(ALPHA.word)).toBeVisible();
    await page.getByRole("button", { name: /Tap the card to flip/ }).click();

    // Mặt sau: nghĩa + 4 nút quality (audio null → không nút phát)
    await expect(page.getByText(ALPHA.meaning)).toBeVisible();
    for (const label of ["Again", "Hard", "Good", "Easy"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Play “/ })).toHaveCount(0);

    // Good (q=4) → rep1 interval 1 ngày → advance sang thẻ bravo
    await page.getByRole("button", { name: "Good", exact: true }).click();
    await expect(page.getByText(BRAVO.word)).toBeVisible();
    await expect(page.getByText(ALPHA.word)).toHaveCount(0);

    // Reload: alpha đã due tomorrow, bravo còn due → đếm 1 (persist qua API)
    await page.reload();
    await expect(page.getByText(/1 word to review today/)).toBeVisible();

    // Bravo → Easy → hết hàng → done, reload → 0 due + empty state
    await page.getByRole("button", { name: /Tap the card to flip/ }).click();
    await page.getByRole("button", { name: "Easy", exact: true }).click();
    await expect(
      page.getByText(/All cards reviewed this session/),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText(/0 words to review today/)).toBeVisible();
    await expect(page.getByText(/Nothing to review today/)).toBeVisible();
  });

  test("VI: nhãn i18n tiếng Việt — Hôm nay cần ôn + 4 nút Lại/Nhớ-kho/Nhớ/Dễ", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Review VI");
    await seedDueProgress(email);

    await page.goto("/vi/me/vocabulary");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ôn tập từ vựng",
    );
    await expect(page.getByText(/Hôm nay cần ôn: 2 từ/)).toBeVisible();

    await page.getByRole("button", { name: /Bấm vào thẻ để lật/ }).click();
    await expect(page.getByText(ALPHA.meaning)).toBeVisible();
    for (const label of ["Lại", "Nhớ-kho", "Nhớ", "Dễ"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("chưa đăng nhập → redirect login kèm ?next", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/me/vocabulary");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fme%2Fvocabulary|\/en\/login\?next=\/en\/me\/vocabulary/);
  });
});

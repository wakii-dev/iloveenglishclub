import { expect, test, type Page } from "@playwright/test";
import { LEARN_BOOK_SLUG, LEARN_WORDS } from "./vocabulary-learn-fixture";

/**
 * E2E learn flow (story vocabulary-learn sf-1): học từ mới trọn vẹn từ trang
 * sách — t-1.1 nút "Học từ này" per-word (prefill ?word= có sẵn) → t-1.2 nút
 * "Bắt đầu học sách này" bulk seed user_word_progress cả book, due_at trải
 * 5 từ/ngày → t-1.3 hub Tổng quan hàng "Khám phá" → t-1.5 lộ trình ngày
 * (mới + ôn) + streak. Fixture qa-learn-* seed/tidy qua globalSetup/teardown;
 * bảng thiếu → setup fail có hướng dẫn (không giả lập DB).
 */

function qaEmail(tag: string): string {
  return `qa-learn-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern hub-overview.spec.ts) → trả email. */
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

test.describe("Learn flow (vocabulary-learn sf-1)", () => {
  test.setTimeout(120_000);

  // t-1.1 — trang per-book: mỗi từ có nút "Học từ này" dẫn ?word= prefill
  test("EN: per-book vocabulary — mỗi từ có link Học từ này ?word=", async ({
    page,
  }) => {
    await registerUser(page, "QA Learn EN");

    await page.goto(`/en/books/${LEARN_BOOK_SLUG}/vocabulary`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Vocabulary",
    );
    await expect(
      page.getByText(new RegExp(`${LEARN_WORDS.length} words`)),
    ).toBeVisible();

    // 12 từ × 1 nút "Học từ này" — href prefill /me/vocabulary?word=<id>
    const learnLinks = page.getByRole("link", {
      name: "Learn this word",
      exact: true,
    });
    await expect(learnLinks).toHaveCount(LEARN_WORDS.length);
    const firstHref = await learnLinks.first().getAttribute("href");
    expect(firstHref).toMatch(/^\/en\/me\/vocabulary\?word=\d+$/);
  });
});

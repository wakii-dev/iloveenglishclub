import { expect, test, type Page } from "@playwright/test";
import { LEARN_BOOK_SLUG, LEARN_WORDS, seedDailyPlanProgress } from "./vocabulary-learn-fixture";

/**
 * E2E learn flow (story vocabulary-learn sf-1): học từ mới trọn vẹn từ trang
 * sách — t-1.1 nút "Học từ này" per-word (prefill ?word= có sẵn) → t-1.2 nút
 * "Bắt đầu học sách này" bulk seed user_word_progress cả book, due_at trải
 * 5 từ/ngày → t-1.3 hub Tổng quan hàng "Khám phá" → t-1.5 lộ trình ngày
 * (mới + ôn) + streak. Fixture qa-learn-book (book QA riêng — count tất định)
 * seed/tidy qua globalSetup/teardown; bảng thiếu → setup fail có hướng dẫn
 * (không giả lập DB).
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

/**
 * Click chờ hydration — nút client có thể chưa gắn handler khi trang dev
 * warm load quá nhanh (pre-hydration click race): bấm lại tới khi status mục
 * tiêu hiện (mỗi lần thử 2s, tối đa 4 lần rồi assert cứng để lộ lỗi thật).
 */
async function clickUntilStatus(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  expected: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await button.click();
    try {
      await expect(page.getByRole("status")).toHaveText(expected, {
        timeout: 2_000,
      });
      return;
    } catch {
      // hydration race — bấm lại
    }
  }
  await expect(page.getByRole("status")).toHaveText(expected, {
    timeout: 5_000,
  });
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

  // t-1.2 — bulk seed lộ trình: đủ 12 từ trải 5/ngày; chạy lại → đã trong lộ trình
  test("EN: Bắt đầu học sách này — seed 12 từ trải 5/ngày, idempotent", async ({
    page,
  }) => {
    await registerUser(page, "QA Learn Bulk");

    await page.goto(`/en/books/${LEARN_BOOK_SLUG}/vocabulary`);
    const bulkButton = page.getByRole("button", {
      name: "Start learning this book",
    });
    await clickUntilStatus(
      page,
      bulkButton,
      "Added 12 words to your plan — 5 words a day.",
    );

    // idempotent: vào lại trang, seed lần nữa → added 0 → báo đã trong lộ trình
    await page.reload({ waitUntil: "domcontentloaded" });
    await clickUntilStatus(
      page,
      page.getByRole("button", { name: "Start learning this book" }),
      "This book is already in your learning plan.",
    );
  });

  // t-1.3 — hub Tổng quan: hàng Khám phá sách còn từ chưa học + nút bulk
  test("EN: hub Khám phá — QA Learn Book còn 12 từ chưa học, có nút bulk", async ({
    page,
  }) => {
    await registerUser(page, "QA Learn Discover");

    await page.goto("/en/vocabulary");
    const discover = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Discover" }) });
    await expect(discover).toBeVisible();
    const row = discover.getByRole("listitem").filter({
      hasText: "QA Learn Book",
    });
    await expect(row).toContainText("12 words to learn");
    await expect(
      row.getByRole("button", { name: "Start learning this book" }),
    ).toBeVisible();
  });

  // t-1.5 — lộ trình hôm nay: 5 mới + 3 ôn, streak 2 ngày, CTA vào phiên ôn
  test("EN: Lộ trình hôm nay — 5 mới + 3 ôn, streak 2 ngày, CTA /me/vocabulary", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Learn Plan");
    await seedDailyPlanProgress(email);

    await page.goto("/en/vocabulary");
    const roadmap = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Today's plan" }) });
    await expect(roadmap).toContainText("5 new words · 3 words to review");
    await expect(roadmap).toContainText("2-day streak");
    const cta = roadmap.getByRole("link", {
      name: "Start today's session",
    });
    await expect(cta).toHaveAttribute("href", "/en/me/vocabulary");
  });
});

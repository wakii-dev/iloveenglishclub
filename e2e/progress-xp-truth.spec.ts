import { expect, test } from "@playwright/test";
import { profileOf } from "./db";

/**
 * E2E SF-3 QA (context pack #7 — XP modifiers server vs preview): user bật
 * relaxed TRÊN UI (persist profiles.relaxed_mode qua action) → làm đúng 1
 * part → chip preview "+5 XP" (computeXp cùng module server) VÀ header XP
 * = 5 (server truth — recompute, không tin client). Modifier ×0.5 chứng minh
 * trên UI thật; bảng đầy đủ 10/8/5/4/8/6 ở integration
 * scripts/sf3-xp-modifiers.test.ts.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const SENT_1 = "I play football with my friends every Saturday.";
const START = /start part|bắt đầu/i;

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

test.describe("XP modifiers truth (SF-3)", () => {
  test.setTimeout(360_000);

  test("relaxed toggle UI → part đúng → preview chip VÀ header đều 5 XP (×0.5 server truth)", async ({
    page,
  }) => {
    const email = sf3Email("xptruth");
    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/display name|tên hiển thị/i).fill("SF3 XP Truth");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up|đăng ký/i })
      .click();
    await page.waitForURL(/\/en$/);

    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();

    // Bật relaxed (nút hiển thị "Strict" khi đang tắt)
    await page.getByRole("button", { name: /^strict$/i }).click();
    await expect(
      page.getByRole("button", { name: /relaxed/i, includeHidden: false }),
    ).toBeVisible({ timeout: 10_000 });

    // Gõ đúng → check → preview chip +5 XP (client computeXp cùng module)
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
    await expect(
      page.locator("span", { hasText: /\+\s?5 XP/ }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Server truth: DB + header (không phải chỉ preview)
    await expect.poll(() => profileOf(email), { timeout: 60_000 }).toEqual({
      xp: 5,
      streak: 1,
    });
    await expect(
      page.getByRole("banner").getByText(/^5 XP/),
    ).toBeVisible({ timeout: 30_000 });
  });
});

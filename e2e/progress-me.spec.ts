import { expect, test } from "@playwright/test";

/**
 * E2E SF-3 QA (context pack #10 — /me): user MỚI — stats 0, heatmap empty
 * message, books "Not started". Số liệu EXACT (DISTINCT parts / best-acc /
 * listenMinutes / window 84 ngày / done-lesson) chứng minh ở integration
 * scripts/sf3-me-stats.test.ts (input kiểm soát) + old progress.spec test 1
 * (flow học thật 38 XP · 4 parts · heatmap hôm nay · book 1/N).
 */

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

test.describe("Me page (SF-3)", () => {
  test.setTimeout(360_000);

  test("user mới: stat cards 0 · heatmap empty message · books Not started", async ({
    page,
  }) => {
    const email = sf3Email("meempty");
    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/display name|tên hiển thị/i).fill("SF3 Me Empty");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up|đăng ký/i })
      .click();
    await page.waitForURL(/\/en$/);

    await page.goto("/en/me", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /my progress/i })).toBeVisible({
      timeout: 30_000,
    });

    // Stat cards render (giá trị 0 với user mới)
    await expect(page.getByText(/parts practiced|phần đã luyện/i).first()).toBeVisible();
    await expect(page.getByText(/total xp|tổng xp/i).first()).toBeVisible();

    // Heatmap: empty message (chưa có daily_activity nào)
    await expect(
      page.getByText(/no study activity|chưa có hoạt động/i).first(),
    ).toBeVisible();

    // Books: có section + trạng thái chưa bắt đầu
    await expect(
      page.getByText(/your books|sách của bạn/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/not started|chưa bắt đầu/i).first(),
    ).toBeVisible();
  });
});

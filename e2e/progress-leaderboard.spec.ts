import { expect, test } from "@playwright/test";

/**
 * E2E SF-3 QA (context pack #9 — leaderboard guest view): /top-users public
 * — guest xem được 2 bảng (weekly/all-time); view chỉ expose display_name/
 * avatar/xp → trang KHÔNG rendered email (guest ẩn — schema assert ở
 * scripts/sf3-leaderboard.test.ts). ISR revalidate=60: chỉ assert render,
 * không assert dữ liệu vừa commit (old progress.spec đã poll SWR).
 */

test.describe("Leaderboard guest view (SF-3)", () => {
  test.setTimeout(120_000);

  test("guest xem /top-users: 2 bảng render, không lộ email user", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/top-users", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByText(/this week|tuần này/i).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/all time|toàn thời gian/i).first(),
    ).toBeVisible();

    // Guest ẩn: không email nào render (view không expose; tầng UI phải giữ)
    const body = await page.locator("main").innerText();
    expect(body, "main KHÔNG được chứa email user nào").not.toMatch(/@/);
  });
});

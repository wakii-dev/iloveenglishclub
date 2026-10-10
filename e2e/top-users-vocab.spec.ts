import { expect, test, type Page } from "@playwright/test";
import {
  TU_EMAIL,
  TU_NAME,
  TU_PASSWORD,
  TU_XP,
  tuProfileXp,
} from "./top-users-vocab-fixture";

/**
 * E2E leaderboard XP vocab (vocab-memrise SF-5, VU-42 — context pack #2):
 * user vocab-only (0 dictation attempt) vẫn hiện weekly /top-users (view
 * migration 0006 UNION ALL vocab_activity); all_time khớp profiles.xp (view
 * đọc thẳng profiles); /me streak giữ khi ngày chỉ học vocab (presence
 * daily_activity — vocab-xp-store recompute khi ngày chuyển active).
 * Dữ liệu seed TRƯỚC server bind trong globalSetup — ISR revalidate=60 nên
 * render đầu đã chứa dữ liệu (đỡ poll SWR như progress.spec cũ).
 */

test.describe("Top-users vocab XP (SF-5)", () => {
  test.setTimeout(120_000);

  async function login(page: Page): Promise<void> {
    await page.context().clearCookies();
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(TU_EMAIL);
    await page.getByLabel(/password|mật khẩu/i).fill(TU_PASSWORD);
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();
    await page.waitForURL(/\/en$/);
  }

  test("user vocab-only 0 dictation vẫn hiện bảng weekly với XP vocab", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/en/top-users", { waitUntil: "domcontentloaded" });

    const weekly = page.locator('[aria-labelledby="weekly-heading"]');
    const row = weekly.getByRole("row").filter({ hasText: TU_NAME });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(TU_XP.toLocaleString("vi-VN"));
  });

  test("all_time khớp profiles.xp của user", async ({ page }) => {
    await login(page);
    await page.goto("/en/top-users", { waitUntil: "domcontentloaded" });

    const dbXp = await tuProfileXp();
    expect(dbXp).toBe(TU_XP);

    const allTime = page.locator('[aria-labelledby="alltime-heading"]');
    const row = allTime.getByRole("row").filter({ hasText: TU_NAME });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(dbXp.toLocaleString("vi-VN"));
  });

  test("/me: streak giữ khi ngày chỉ học vocab (presence daily_activity)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/vi/me", { waitUntil: "domcontentloaded" });

    // stats.streak đọc cache profiles.streak_count = 2 (seed khớp presence
    // hôm nay + hôm qua) — vocab-only ngày hôm nay không ăn mất streak
    const streakTile = page
      .locator("dl div")
      .filter({ hasText: "Chuỗi hiện tại" });
    await expect(streakTile).toHaveCount(1);
    await expect(streakTile.locator("dd")).toHaveText(/^2$/);
  });
});

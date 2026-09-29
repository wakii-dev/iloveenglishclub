import { expect, test } from "@playwright/test";

/**
 * E2E 404 not-found (SF-5 QA, context pack #8 — P0-2 exit criteria): URL không
 * tồn tại → not-found render đúng en/vi (styled, HTTP 404 thật), catch-all
 * bắt mọi path lạ dưới locale (`e1e5967` + [...rest]).
 *
 * Error boundary `error.tsx` render en/vi được verify ở unit SSR test
 * src/app/(public)/[locale]/error.test.ts (dev mode có error overlay chặn
 * trigger qua URL — ghi evidence; prod thật là SF-6).
 */

test("404 [en]: HTTP 404 + styled not-found đúng tiếng", async ({ page }) => {
  const res = await page.goto("/en/no-such-page-xyz");
  expect(res?.status()).toBe(404);

  await expect(page.locator("h1")).toHaveText("Page not found");
  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse all levels" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("404 [vi]: HTTP 404 + styled not-found đúng tiếng", async ({ page }) => {
  const res = await page.goto("/vi/no-such-page-xyz");
  expect(res?.status()).toBe(404);

  await expect(page.locator("h1")).toHaveText("Không tìm thấy trang");
  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Về trang chủ" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem các cấp độ" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});

test("404: path sâu bất kỳ dưới locale cũng rơi catch-all (không lộ raw error)", async ({
  page,
}) => {
  const res = await page.goto("/vi/books/level-3/xyz-deep/nothing");
  expect(res?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText("Không tìm thấy trang");
  // Không lộ stack/message lỗi thô
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toMatch(/Error:|at\s+\w+\s+\(/);
});

test("404 CTA hoạt động: về trang chủ + browse levels", async ({ page }) => {
  await page.goto("/en/xyz");
  await page.getByRole("link", { name: "Back to home" }).click();
  await page.waitForURL((u) => u.pathname === "/en");
  await expect(page.locator("h1")).toBeVisible();
});

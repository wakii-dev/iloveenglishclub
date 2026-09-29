import { expect, test } from "@playwright/test";

/**
 * E2E i18n switch (SF-7 context pack #7): đổi locale giữ nguyên trang hiện tại
 * — ACCEPTANCE #5: đang ở lesson, bấm switch EN↔VI → vẫn đúng lesson đó,
 * UI đổi ngữ. URL assert bằng RegExp predicate trên pathname (glob
 * false-positive khi có query — bài học e2e đã ghi).
 */

const LESSON_PATH = "/books/level-3/units/1/lessons/1/listen-and-type";

/**
 * Scoped vào group switcher + exact:true — getByRole name mặc định substring
 * (case-insensitive) nên "EN" khớp cả nút khác trên trang (strict violation).
 */
function switchLocale(page: import("@playwright/test").Page, locale: "en" | "vi") {
  return page
    .getByRole("group", { name: /Language|Ngôn ngữ/ })
    .getByRole("button", { name: locale, exact: true })
    .click();
}

test("lesson: switch EN→VI→EN giữ nguyên trang, UI đổi ngữ", async ({
  page,
}) => {
  await page.goto(`/en${LESSON_PATH}`);

  // Đang ở lesson EN
  expect(new URL(page.url()).pathname).toBe(`/en${LESSON_PATH}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/Free time activities/);

  // Switch VI — cùng path, chỉ đổi prefix locale
  await switchLocale(page, "vi");
  await page.waitForURL((url) => url.pathname === `/vi${LESSON_PATH}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");

  // UI đổi ngữ: title từ DB (title_vi) + meta description template VI
  await expect(page).toHaveTitle(/Từ vựng — Hoạt động thời gian rảnh/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /chép chính tả/,
  );

  // Switch ngược EN — vẫn đúng lesson
  await switchLocale(page, "en");
  await page.waitForURL((url) => url.pathname === `/en${LESSON_PATH}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/Free time activities/);
});

test("home: switch VI→EN giữ nguyên trang", async ({ page }) => {
  await page.goto("/vi");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page).toHaveTitle(/Luyện chép chính tả/);

  await switchLocale(page, "en");
  await page.waitForURL((url) => url.pathname === "/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/Free English Dictation Practice/);
});

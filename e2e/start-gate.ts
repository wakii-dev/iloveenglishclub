import { expect, type Page } from "@playwright/test";

/** Click Start + ĐỢI textbox — retry khi click rớt pre-hydration (lesson
 * e2e-authoring; flake dictation specs sweep SF-4: click trước hydration bị
 * nuốt, phase không chuyển, expect textbox treo). Click timeout NGẮN để
 * retry vòng sau; toPass chỏm chịu compile-lạnh dev (sweep xoá .next). */
export async function startPart(
  page: Page,
  startName: RegExp | string = /start part|bắt đầu/i,
): Promise<void> {
  await expect(async () => {
    if (!(await page.getByRole("textbox").isVisible().catch(() => false))) {
      await page
        .getByRole("button", { name: startName })
        .click({ timeout: 2_500 })
        .catch(() => {});
    }
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

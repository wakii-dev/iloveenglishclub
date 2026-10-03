import { expect, test, type Page } from "@playwright/test";

/**
 * E2E word-lookup popover (story vocabulary-module SF-5 t-5.3): lesson demo
 * level-3/u1/l1 → start → skip part 1 (mở khoá câu 1) → tab Full transcript →
 * bấm "football" (fixture seed vào book level-3) → popover nghĩa QA + nút
 * audio → click ngoài đóng → bấm từ ngoài bộ từ vựng → thông báo miss →
 * Escape đóng. Fixture seed/tidy qua globalSetup/teardown (chỉ row nghĩa QA);
 * bảng thiếu → globalSetup fail có hướng dẫn migration 0002.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const START = /start part|bắt đầu/i;
const SKIP = /skip this sentence|bỏ qua câu/i;
const TAB = /full transcript|toàn bộ bài đọc/i;
const QA_MEANING = "từ QA lookup (bóng đá)";
const MISS = /isn't in the book's vocabulary yet|chưa có trong bộ từ vựng/i;

async function openTranscript(page: Page) {
  await page.goto(LESSON, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: START }).click();
  await expect(page.getByText(/Part 1 of 4|Phần 1 \/ 4/i)).toBeVisible();
  await page.getByRole("button", { name: SKIP }).click(); // câu 1 hết khoá
  await page.getByRole("button", { name: TAB }).click();
  return page
    .getByRole("list", { name: TAB })
    .locator("li")
    .first();
}

test.describe("Word lookup popover (vocabulary SF-5)", () => {
  test.setTimeout(120_000);

  test("bấm từ có trong bộ từ vựng → popover nghĩa + audio; click ngoài/Escape đóng; từ lạ → miss", async ({
    page,
  }) => {
    const sentence = await openTranscript(page);

    // HIT: "football" — dialog nghĩa QA + nút phát audio (30s: lần gọi đầu
    // compile route API trên dev server)
    await sentence.getByRole("button", { name: "football", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(QA_MEANING)).toBeVisible();
    await expect(
      dialog.locator("audio[src*='qa-lookup-football']"),
    ).toHaveCount(1);

    // Click ngoài → đóng
    await page.getByRole("heading", { name: TAB }).click();
    await expect(dialog).toHaveCount(0);

    // MISS: "every" không có trong bộ từ vựng của book
    await sentence.getByRole("button", { name: "every", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(MISS)).toBeVisible({
      timeout: 30_000,
    });

    // Escape → đóng
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

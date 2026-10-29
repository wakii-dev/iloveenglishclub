import { expect, test } from "@playwright/test";

/**
 * E2E SMOKE dictation guest (migrate SF4) — happy path rút gọn từ
 * e2e/dictation-guest.spec.ts của ilec gốc: Start gate → player → gõ sai →
 * diff → sửa đúng → next Part 2. Cần seed demo L3-U1-L1 (scripts/seed.ts,
 * audio tone commit public/audio) — như base config của ilec gốc.
 */

// v2 (migrate SF2): route dictation là /dictation/[book]/[unit]/[lesson]
// (tree books→dictation) — không còn /books/.../listen-and-type của ilec.
const LESSON = "/en/dictation/level-3/1/1";
const SENT_1 = "I play football with my friends every Saturday.";

const START = /start part|bắt đầu/i;

test.describe("Smoke: dictation guest happy path @smoke", () => {
  test.setTimeout(120_000);

  test("Start → Part 1 → gõ sai → diff → sửa đúng → next Part 2", async ({
    page,
  }) => {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();

    await page.getByRole("button", { name: START }).click();

    // DICTATION: player pill + textarea + Part 1/4
    await expect(page.getByText(/Part 1 of 4|Phần 1 \/ 4/i)).toBeVisible();
    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByRole("textbox")).toBeVisible();

    // gõ sai 1 từ ("friend" thay "friends")
    await page
      .getByRole("textbox")
      .fill("I play football with my friend every Saturday");
    await page.keyboard.press("Enter"); // check ĐẦU qua Enter
    await expect(page.getByText(/exactly right|chính xác/i)).toHaveCount(0);

    // diff: từ sai đỏ gạch + chip từ đúng phía trên
    await expect(page.locator("span.line-through").first()).toBeVisible();
    await expect(page.locator("i.not-italic").first()).toHaveText("friends");

    // sửa + check LẠI (Enter — không giới hạn)
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();

    // Enter = next → Part 2
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Part 2 of 4|Phần 2 \/ 4/i)).toBeVisible();
  });
});

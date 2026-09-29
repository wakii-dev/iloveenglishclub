import { expect, test } from "@playwright/test";

/**
 * Task 6 — Part-nav / progress / results / transcript (context pack slice #5)
 * — expansion sâu hơn baseline dictation-guest: diff persist khi review,
 * progress bước theo DONE (skip không đếm), results accuracy = TB **first-
 * accuracy các part DONE** (skip có lastDiff → review words), play-all queue,
 * fallback "Back to unit" khi hết lesson cùng unit.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const LESSON_LAST = "/en/books/level-3/units/1/lessons/2/listen-and-type";
const START = /start part|bắt đầu/i;
const S1 = "I play football with my friends every Saturday.";
const S1_WRONG = "I play football with my friend every Saturday.";
const S2 = "She likes reading books in the library.";
const S3_WRONG = "We watch a movie at the weekend."; // sai "film"→"movie"

test.describe("Dictation nav / progress / results / transcript", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  async function start(page: import("@playwright/test").Page, url = LESSON): Promise<void> {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
  }

  function progressWidth(page: import("@playwright/test").Page) {
    return page.locator("[role=progressbar] span").first();
  }

  test("Diff persist khi review ‹: part skipped (next khi còn sai) giữ diff đỏ + typed; › frozen đúng", async ({
    page,
  }) => {
    await start(page);
    await page.getByRole("textbox").fill(S1_WRONG);
    await page.keyboard.press("Enter"); // check — 1 đỏ
    await expect(page.locator("span.line-through")).toHaveCount(1);

    // Next khi còn sai → part 1 "skipped" ngầm; skip part 2; ‹ ‹ về part 1
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    await expect(page.getByText(/Part 2 of 4|Phần 2 \/ 4/i)).toBeVisible();
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();
    await expect(page.getByText(/Part 3 of 4|Phần 3 \/ 4/i)).toBeVisible();
    // Nav clicks liền kề cần nhịp: click trong window re-render bị rớt âm thầm
    // (repro: 800ms pause → prev luôn OK; không pause → click có khi không tác dụng)
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /previous part|phần trước/i }).click();
    await expect(page.getByText(/Part 2 \/ 4|Phần 2 \/ 4/i)).toBeVisible(); // part 2 frozen (skipped)
    await page.getByRole("button", { name: /previous part|phần trước/i }).click();
    await expect(page.getByText(/Part 1 \/ 4|Phần 1 \/ 4/i)).toBeVisible();
    await page.waitForTimeout(800);

    // DIFF PERSIST (spec-critic P1): 1 đỏ + chip từ đúng + typed giữ; KHÔNG
    // banner "Exactly right" (lastDiff là diff sai của part skipped)
    await expect(page.locator("span.line-through")).toHaveCount(1);
    await expect(page.locator("span.line-through i").first()).toHaveText("friends");
    await expect(page.getByText(/exactly right|chính xác/i)).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("textbox")).toHaveValue(S1_WRONG);

    // › thuần điều hướng về part 2 (skipped — frozen)
    await page.getByRole("button", { name: /next part|phần sau/i }).click();
    await expect(page.getByText(/Part 2 \/ 4|Phần 2 \/ 4/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveAttribute("readonly", "");
  });

  test("Progress bar bước theo DONE: 25% → 50%; SKIP không tăng", async ({
    page,
  }) => {
    await start(page);
    await page.getByRole("textbox").fill(S1);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    await expect(progressWidth(page)).toHaveAttribute("style", /25%/);

    await page.getByRole("textbox").fill(S2);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    await expect(progressWidth(page)).toHaveAttribute("style", /50%/);

    // Part 3 SKIP — progress vẫn 50%
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();
    await expect(page.getByText(/Part 4 of 4|Phần 4 \/ 4/i)).toBeVisible();
    await expect(progressWidth(page)).toHaveAttribute("style", /50%/);
  });

  test("Results: accuracy = TB first-accuracy part DONE (87.5+100)/2→94%; review words từ part skipped", async ({
    page,
  }) => {
    await start(page);
    // Part 1: sai 1 từ rồi sửa — first acc 7/8
    await page.getByRole("textbox").fill(S1_WRONG);
    await page.keyboard.press("Enter");
    await page.getByRole("textbox").fill(S1);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    // Part 2: đúng ngay
    await page.getByRole("textbox").fill(S2);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    // Part 3: check SAI rồi SKIP — lastDiff giữ để review words
    await page.getByRole("textbox").fill(S3_WRONG);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();
    // Part 4: skip luôn
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();

    await expect(page.getByText(/great job|tuyệt vời/i)).toBeVisible();
    // accuracy = (0.875 + 1) / 2 = 0.9375 → 94% (không phải 100% — skip không tính)
    await expect(page.locator('[role="img"]', { hasText: /%/ })).toHaveText(/94%/);
    await expect(page.getByText(/2 done · 2 skipped|2 xong · 2 bỏ qua/i)).toBeVisible();
    // XP = 9 (part1 first 7/8) + 10 (part2) + 9 (part3 check sai 6/7 = 8.57
    // rồi skip — XP đã bank GIỮ, §3.2) = 28
    await expect(page.getByText(/\+\s?28 XP earned/i)).toBeVisible();
    // review words: part 3 skipped có lastDiff → "film" (transcriptToken)
    await expect(page.getByText(/words to review|từ cần ôn/i)).toContainText("film");
  });

  test("Transcript MIXED unlock: part 1 done → câu 1 thường, câu 2+ blur; part xong thêm thì mở thêm", async ({
    page,
  }) => {
    await start(page);
    await page.getByRole("textbox").fill(S1);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();

    await page
      .getByRole("button", { name: /full transcript|toàn bộ bài đọc/i })
      .click();
    const items = page
      .getByRole("list", { name: /full transcript|toàn bộ bài đọc/i })
      .locator("li");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).not.toHaveClass(/blur/); // done → mở
    await expect(items.nth(1)).toHaveClass(/blur/); // pending → blur
    await expect(items.nth(2)).toHaveClass(/blur/);
  });

  test("Play-all queue: highlight chuyển tuần tự sang câu 2 sau khi câu 1 hết (3.5s)", async ({
    page,
  }) => {
    await start(page);
    await page
      .getByRole("button", { name: /full transcript|toàn bộ bài đọc/i })
      .click();
    await page
      .getByRole("button", { name: /play all|phát tất cả/i })
      .click();
    const items = page
      .getByRole("list", { name: /full transcript|toàn bộ bài đọc/i })
      .locator("li");
    await expect(items.nth(0)).toHaveClass(/text-primary/);
    await expect(items.nth(1)).toHaveClass(/text-primary/, { timeout: 6_000 }); // queue tuần tự
  });

  test("Hết unit: results fallback 'Back to unit' (không 'Next lesson') — lesson cuối unit", async ({
    page,
  }) => {
    await start(page, LESSON_LAST); // L3-U1-L2 — lesson số 2 (cuối unit 1)
    for (let i = 1; i <= 3; i++) {
      await page
        .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
        .click();
    }
    await expect(page.getByText(/great job|tuyệt vời/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to unit|về unit/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /next lesson|bài tiếp theo/i }),
    ).toHaveCount(0); // fallback branch — không có next
  });
});

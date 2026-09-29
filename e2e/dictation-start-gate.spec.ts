import { expect, test } from "@playwright/test";

/**
 * Task 5 — Start-gate (context pack slice #4): phase idle → start-gate →
 * playing; KHÔNG tự advance khi chưa click; audio THẬT phát sau click
 * (paused=false, currentTime chạy). Config sf2 có `--autoplay-policy=
 * no-user-gesture-required` (stability headless) — GESTURE-GATE thật (policy
 * mặc định Chromium, không flags) verify ở Rule 0 real-browser tier (Phase 5)
 * và ghi evidence riêng.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const START = /start part|bắt đầu/i;

test.describe("Dictation start-gate", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  function mainAudio(page: import("@playwright/test").Page) {
    return page.locator("audio").first();
  }

  test("Idle → start-gate: Start button; KHÔNG tự phát, KHÔNG tự advance khi chưa click", async ({
    page,
  }) => {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();

    // audio preload sẵn (preload=auto) nhưng PAUSED — chưa có gesture
    await expect(mainAudio(page)).toHaveJSProperty("paused", true);

    await page.waitForTimeout(2_000); // không tự advance
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await expect(mainAudio(page)).toHaveJSProperty("paused", true);
  });

  test("Click Start (1 gesture) → playing NGAY: paused=false + currentTime chạy", async ({
    page,
  }) => {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible(); // dictation pane

    // play() thành công sau đúng 1 gesture (sticky activation) — không cần
    // thao tác thứ 2; autoplay policy chặn thì paused vẫn true → bắt tại đây
    await expect
      .poll(async () => mainAudio(page).evaluate((el) => (el as HTMLAudioElement).paused), {
        timeout: 5_000,
      })
      .toBe(false);

    const t0 = await mainAudio(page).evaluate((el) => (el as HTMLAudioElement).currentTime);
    await page.waitForTimeout(1_200);
    const t1 = await mainAudio(page).evaluate((el) => (el as HTMLAudioElement).currentTime);
    expect(t1).toBeGreaterThan(t0); // âm thanh đang chạy thật
  });

  test("Try-again từ complete: chuỗi reset → nạp parts → start-gate → playing lại từ part 1", async ({
    page,
  }) => {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: START }).click();
    // skip nhanh 4 part để tới complete
    for (let i = 1; i <= 4; i++) {
      await page
        .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
        .click();
    }
    await expect(page.getByText(/great job|tuyệt vời/i)).toBeVisible();

    await page
      .getByRole("button", { name: /try again|làm lại/i })
      .click(); // doStart: reset → start(parts) → start()
    await expect(page.getByText(/Part 1 of 4|Phần 1 \/ 4/i)).toBeVisible();
    await expect
      .poll(async () => mainAudio(page).evaluate((el) => (el as HTMLAudioElement).paused), {
        timeout: 5_000,
      })
      .toBe(false); // autoplay câu 1 lại chạy (advance logic)
    // src được buộc load lại từ đầu (appliedSrcRef null — fix P2 review)
    const t = await mainAudio(page).evaluate((el) => (el as HTMLAudioElement).currentTime);
    expect(t).toBeLessThan(1);
  });
});

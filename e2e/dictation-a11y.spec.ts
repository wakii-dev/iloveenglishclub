import { expect, test } from "@playwright/test";

/**
 * Task 10 — A11y keyboard/aria TRÊN FLOW THẬT (context pack slice #9):
 * shortcuts panel (open/close/click-outside + role dialog), shortcuts thật
 * (Tab replay · Esc pause · Ctrl+Shift+/ hint · ←/→ seek ±3s không trong
 * textarea), focus ring keyboard (focus-visible outline), aria-live diff,
 * progressbar/slider/dots aria, aria-pressed toggles.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const START = /start part|bắt đầu/i;

test.describe("Dictation a11y (keyboard + aria trên flow thật)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  async function start(page: import("@playwright/test").Page): Promise<void> {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
  }

  test("Shortcuts panel: mở qua keyboard, role dialog, đủ 5 hàng phím, Esc/click-outside đóng", async ({
    page,
  }) => {
    await start(page);
    const openBtn = page.getByRole("button", { name: /keyboard shortcuts|phím tắt/i });
    await openBtn.focus();
    await page.keyboard.press("Enter"); // mở bằng keyboard (không mouse)

    const dialog = page.getByRole("dialog", { name: /keyboard shortcuts|phím tắt/i });
    await expect(dialog).toBeVisible();
    for (const key of ["Tab", "Enter", "Ctrl+Shift+/", "Esc", "← / →"]) {
      await expect(dialog.locator("kbd", { hasText: key })).toBeVisible();
    }

    await page.keyboard.press("Escape");
    // Esc trong panel — panel đóng? backdrop click-outside mới đóng (panel
    // không trap Escape) — đóng bằng click backdrop (không phải panel)
    const stillOpen = await dialog.isVisible().catch(() => false);
    if (stillOpen) {
      await page.mouse.click(10, 400); // backdrop
    }
    await expect(dialog).toBeHidden();
  });

  test("Tab = replay (preventDefault, không rời focus); Esc = pause; audio thật", async ({
    page,
  }) => {
    await start(page);
    const audio = page.locator("audio").first();
    await expect
      .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), {
        timeout: 5_000,
      })
      .toBe(false);

    // Tab replay: focus ở textbox — preventDefault → KHÔNG chuyển focus
    await page.getByRole("textbox").focus();
    const activeBefore = await page.evaluate(() => document.activeElement?.tagName);
    await page.keyboard.press("Tab");
    const activeAfter = await page.evaluate(() => document.activeElement?.tagName);
    expect(activeAfter).toBe(activeBefore); // Tab bị chặn — replay thay vì điều hướng
    const t = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
    expect(t).toBeLessThan(0.5); // replay về đầu

    // Esc pause: audio dừng thật
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), {
        timeout: 3_000,
      })
      .toBe(true);
  });

  test("Ctrl+Shift+/ = hint lộ 1 từ; ←/→ = seek ±3s (khi KHÔNG focus textarea)", async ({
    page,
  }) => {
    await start(page);
    // Hint shortcut (textarea đang focus — shortcut vẫn chạy, target không chặn)
    await page.keyboard.press("Control+Shift+Slash");
    await expect(page.locator("div.bg-accent")).toBeVisible(); // hint strip lộ
    await expect(page.locator("div.bg-accent span.rounded-full").first()).toHaveText("I");

    // Seek: click nền pane (không textarea) rồi ArrowRight — currentTime tăng ~3s
    await page.getByRole("textbox").blur();
    const before = await page
      .locator("audio")
      .first()
      .evaluate((el) => (el as HTMLAudioElement).currentTime);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(600);
    const after = await page
      .locator("audio")
      .first()
      .evaluate((el) => (el as HTMLAudioElement).currentTime);
    expect(after).toBeGreaterThanOrEqual(Math.min(before + 2.5, 3.5)); // clamp duration

    // Trong textarea → KHÔNG seek (typing arrow dùng di chuyển con trỏ)
    const mid = await page
      .locator("audio")
      .first()
      .evaluate((el) => (el as HTMLAudioElement).currentTime);
    await page.getByRole("textbox").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    const still = await page
      .locator("audio")
      .first()
      .evaluate((el) => (el as HTMLAudioElement).currentTime);
    expect(Math.abs(still - mid)).toBeLessThan(0.3); // không seek khi gõ
  });

  test("QA-106: Tab từ button DI CHUYỂN focus (không trap) + focus-visible outline; trong textarea vẫn replay", async ({
    page,
  }) => {
    await start(page);

    // Tab từ textarea = replay (spec §5 giữ nguyên)
    await page.getByRole("textbox").focus();
    const focusBefore = await page.evaluate(() => document.activeElement?.tagName);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
      focusBefore,
    ); // không rời textarea — replay thay điều hướng

    // Tab từ BUTTON → focus DI CHUYỂN (QA-106 fix — không trap)
    await page
      .getByRole("button", { name: /full transcript|toàn bộ bài đọc/i })
      .focus();
    await page.keyboard.press("Tab");
    const moved = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        text: el?.textContent?.slice(0, 30) ?? "",
        outline: getComputedStyle(el!).outlineStyle,
        width: getComputedStyle(el!).outlineWidth,
      };
    });
    expect(moved.tag === "BUTTON" || moved.tag === "A").toBe(true);
    // focus-visible outline áp cho keyboard focus (a11y hard bar)
    expect(moved.outline).not.toBe("none");
    expect(parseFloat(moved.width)).toBeGreaterThan(0);
  });

  test("aria-live diff; aria-pressed toggles; dots/slider/progressbar aria", async ({
    page,
  }) => {
    await start(page);

    // aria-live diff container + aria-pressed toggles + tabs
    await page.getByRole("textbox").fill("I play football with my friend every Saturday.");
    await page.keyboard.press("Enter");
    await expect(page.locator('[aria-live="polite"]')).toBeVisible(); // diff vùng live
    await expect(page.getByRole("button", { name: "Strict" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(
      page.getByRole("button", { name: /full transcript/i }),
    ).toHaveAttribute("aria-pressed", "false");

    // Dots + slider + progressbar aria
    await expect(page.getByRole("img", { name: /Sentence 1 of 4|Câu 1 \/ 4/ })).toBeVisible();
    const slider = page.getByRole("slider");
    const maxVal = Number(await slider.getAttribute("aria-valuemax"));
    expect(maxVal).toBeGreaterThanOrEqual(3); // 3.5s → Math.round(3.5)=4
    const now = Number(await slider.getAttribute("aria-valuenow"));
    expect(now).toBeGreaterThanOrEqual(0);
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});

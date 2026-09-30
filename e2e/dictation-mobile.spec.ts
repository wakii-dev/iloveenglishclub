import { expect, test, devices } from "@playwright/test";

/**
 * Task 8 — Mobile EMULATED iPhone 12 (context pack slice #7): tap targets,
 * keyboard Enter-as-submit qua mobile viewport, safe-area (input không bị
 * che), layout không tràn ngang. Thiết bị thật + IME thật ngoài khả năng
 * agent → Recommendations cuối story (spec-critic P1-2).
 * Tap targets: đo boundingBox THẬT rồi triage (QA-105) — bar checklist ≥44px.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const START = /start part|bắt đầu/i;
const S1 = "I play football with my friends every Saturday.";

// iPhone 12 emulated cho CẢ file (defaultBrowserType chỉ được set top-level).
// Engine: chromium (webkit special-build Bus error 10 trên macOS 14.3 arm64 —
// env này không launch được; metrics giữ nguyên device: 390×844 DPR3 touch UA).
// iOS Safari thật → Recommendations (thiết bị thật ngoài khả năng agent).
test.use({ ...devices["iPhone 12"], browserName: "chromium" });

test.describe("Dictation mobile (iPhone 12 emulated)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  async function start(page: import("@playwright/test").Page): Promise<void> {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
  }

  test("Gesture start trên mobile → playing; layout không tràn ngang; input không bị che", async ({
    page,
  }) => {
    const overflow = await page.evaluate(() => typeof document !== "undefined");
    expect(overflow).toBe(true); // sanity — evaluate chạy

    await start(page);

    // Không tràn ngang
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerW = await page.evaluate(() => window.innerWidth);
    expect(scrollW).toBeLessThanOrEqual(innerW);

    // Safe-area: textarea nằm gọn trong viewport (iPhone 12: 390×844, home
    // indicator ~34px) — không bị clip đáy
    const box = await page.getByRole("textbox").boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThan(844 - 20);
    expect(box!.x).toBeGreaterThanOrEqual(0);

    // QA-107 regression: tabs row (XP chip + part label) KHÔNG bị clip mép phải
    const vp = await page.evaluate(() => window.innerWidth);
    const xpChip = await page.locator("span", { hasText: /\+\s?\d+ XP/ }).first().boundingBox();
    expect(xpChip).toBeTruthy();
    expect(xpChip!.x + xpChip!.width).toBeLessThanOrEqual(vp + 1);

    // Audio thật phát sau 1 tap (autoplay policy mobile emulated — gesture)
    await expect
      .poll(
        async () =>
          page.locator("audio").first().evaluate((el) => (el as HTMLAudioElement).paused),
        { timeout: 5_000 },
      )
      .toBe(false);
  });

  test("Enter-as-submit mobile keyboard: sai → diff; sửa → 'Exactly right!' (không cần nút)", async ({
    page,
  }) => {
    await start(page);
    const ta = page.getByRole("textbox");
    await ta.tap(); // TAP thật (touch) focus
    await ta.pressSequentially("I play football with my friend");
    await ta.press("Enter");
    await expect(page.locator("span.line-through").first()).toBeVisible();

    await ta.fill(S1);
    await ta.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
  });

  test("QA-105 đo tap targets: control chính flow gõ (play/check) ≥44px; snapshot các control phụ", async ({
    page,
  }) => {
    await start(page);
    const targets: Record<string, number> = {};
    const play = await page
      .getByRole("button", { name: /pause|tạm dừng/i })
      .first()
      .boundingBox();
    targets.play = play!.height;
    const check = await page
      .getByRole("button", { name: /check|kiểm tra/i })
      .boundingBox();
    targets.check = check!.height;
    const speed = await page
      .getByRole("button", { name: /speed|tốc độ/i })
      .boundingBox();
    targets.speed = speed!.height;
    const ta = await page.getByRole("textbox").boundingBox();
    targets.textarea = ta!.height;

    // Control CHÍNH của flow gõ phải đạt bar 44px (checklist qa-checklist)
    expect(targets.play).toBeGreaterThanOrEqual(44); // 52px ✓
    expect(targets.check).toBeGreaterThanOrEqual(44);
    // Snapshot phụ — in rõ để triage QA-105 (console = evidence đo được)
    console.log("[QA-105 tap targets]", JSON.stringify(targets));
  });
});

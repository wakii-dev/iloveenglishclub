import { expect, test } from "@playwright/test";

/**
 * E2E fallback chain vi→en→raw (SF-5 QA, context pack #5): content thiếu
 * translation render đúng bậc kế (đối chiếu localize()), KHÔNG trang trắng.
 *
 * Fixture TỰ NHIÊN của template seed: level-3/u1/l2 published + title_vi NULL
 * → /vi phải rơi xuống title_en ("Dialogue — After school") ở title/h1/JSON-LD.
 * Tier "raw" (`Lesson ${n}` khi thiếu CẢ en+vi) không có row tự nhiên trong
 * template data — do unit test localize.test.ts bảo vệ (pure logic), không tạo
 * row fixture (cleanup content không nằm trong helper @test.ilec).
 */

const L2_PATH = "/books/level-3/units/1/lessons/2/listen-and-type";
const EN_FALLBACK_TITLE = "Dialogue — After school";

test("vi lesson thiếu title_vi → render title_en ở title tag (fallback bậc en)", async ({
  page,
}) => {
  const res = await page.goto(`/vi${L2_PATH}`);
  expect(res?.status()).toBe(200);

  await expect(page).toHaveTitle(new RegExp(`${EN_FALLBACK_TITLE.replace(/[—]/g, "—")} · I Love English Club`));
  // Không trang trắng
  expect((await page.locator("body").textContent())?.trim().length ?? 0).toBeGreaterThan(100);
  await expect(page.locator("h1")).toHaveText(EN_FALLBACK_TITLE);
});

test("vi lesson thiếu title_vi → JSON-LD name cũng rơi xuống title_en", async ({ page }) => {
  await page.goto(`/vi${L2_PATH}`);
  const raw = await page.evaluate(
    () =>
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? "null",
  );
  const parsed = JSON.parse(raw);
  expect(parsed.name).toBe(EN_FALLBACK_TITLE);
  expect(parsed.inLanguage).toBe("en");
});

test("en lesson đủ title_en → hiển thị en (không lệch do fallback)", async ({ page }) => {
  await page.goto(`/en${L2_PATH}`);
  await expect(page.locator("h1")).toHaveText(EN_FALLBACK_TITLE);
  await expect(page).toHaveTitle(new RegExp(EN_FALLBACK_TITLE));
});

test("vi unit CÓ title_vi → hiển thị vi (guard: fallback không ăn nhầm row đủ dịch)", async ({
  page,
}) => {
  await page.goto("/vi/books/level-3/units/1");
  await expect(page.locator("h1")).toContainText("Thời gian rảnh");
});

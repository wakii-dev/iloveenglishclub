import { expect, test } from "@playwright/test";

/**
 * E2E browse flow (SF-5 QA, context pack #7): home (carousel `82bbb3b` —
 * slide/arrows/progress hoạt động, không layout break) → books → book →
 * unit → lesson, cả en/vi, không dead-end.
 *
 * Carousel tương tác qua trusted click (Playwright) — Orca embedded browser
 * có quirk scroll-animation khi tab không surfaced (CDP screenshot timeout
 * cùng gốc lỗi), Playwright Chromium là instrument đúng cho interaction.
 */

const BOOK = "level-3";
const LESSON_PATH = `/books/${BOOK}/units/1/lessons/1/listen-and-type`;

const CAROUSEL = "[class*='snap-x']";

async function carouselState(page: import("@playwright/test").Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const prev = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Previous levels",
    );
    const next = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "More levels",
    );
    const bar = el
      .closest(".relative")
      ?.parentElement?.querySelector<HTMLElement>(
        "[class*='bg-secondary'][class*='h-full']",
      );
    return {
      scrollLeft: el.scrollLeft,
      max: el.scrollWidth - el.clientWidth,
      prevDisabled: prev?.disabled ?? null,
      nextDisabled: next?.disabled ?? null,
      progress: bar?.style?.width ?? null,
    };
  }, CAROUSEL);
}

test("home carousel: next arrow scroll trang, prev enable, progress tăng", async ({ page }) => {
  await page.goto("/en");

  const before = await carouselState(page);
  expect(before, "carousel + nút render").toBeTruthy();
  expect(before!.max).toBeGreaterThan(100); // 7 cards tràn viewport → có thể slide
  expect(before!.prevDisabled).toBe(true); // ở đầu — prev disabled
  expect(before!.nextDisabled).toBe(false);

  await page.getByRole("button", { name: "More levels" }).click();
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector<HTMLElement>(sel);
      return el ? el.scrollLeft > 100 : false;
    },
    CAROUSEL,
    { timeout: 5_000 },
  );

  const after = await carouselState(page);
  expect(after!.scrollLeft).toBeGreaterThan(100);
  expect(after!.prevDisabled).toBe(false); // prev enable sau khi scroll
  expect(after!.progress).not.toBe(before!.progress); // progress bar tăng

  // Slide ngược về đầu — chờ đúng state component (canPrev = scrollLeft > 4)
  await page.getByRole("button", { name: "Previous levels" }).click();
  await expect(page.getByRole("button", { name: "Previous levels" })).toBeDisabled({
    timeout: 5_000,
  });
  expect((await carouselState(page))!.scrollLeft).toBeLessThan(10);
});

test("browse flow EN: home → books → book → unit → lesson, không dead-end", async ({ page }) => {
  await page.goto("/en");

  // home → books (nav "Levels")
  await page.getByRole("link", { name: "Levels" }).first().click();
  await page.waitForURL((u) => u.pathname === "/en/books");
  await expect(page.locator("h1")).toBeVisible();

  // books → book level-3 (card link chứa "Level 3")
  await page.getByRole("link", { name: /Level 3/ }).first().click();
  await page.waitForURL((u) => u.pathname === `/en/books/${BOOK}`);

  // book → unit 1
  await page.getByRole("link", { name: /Unit 1|Free time/ }).first().click();
  await page.waitForURL((u) => u.pathname === `/en/books/${BOOK}/units/1`);

  // unit → lesson 1 (listen-and-type) — lesson pill link là "Open" (title
  // nằm ngoài link) → selector theo href
  await page.locator(`a[href$="/lessons/1/listen-and-type"]`).first().click();
  await page.waitForURL((u) => u.pathname === `/en${LESSON_PATH}`);

  // lesson render + start-gate hiện (không dead-end) — flow vào player là
  // surface SF-2 (boundary): assert audio + nút start, KHÔNG click vào player
  await expect(page.locator("h1")).toContainText("Free time activities");
  await expect(page.locator("audio").first()).toBeAttached(); // audio hidden (no controls) — attached là đủ
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
});

test("browse flow VI: home → books → book → unit → lesson, không dead-end", async ({ page }) => {
  await page.goto("/vi");

  await page.getByRole("link", { name: "Cấp độ" }).first().click();
  await page.waitForURL((u) => u.pathname === "/vi/books");
  await expect(page.locator("h1")).toBeVisible();

  await page.getByRole("link", { name: /Cấp độ 3/ }).first().click();
  await page.waitForURL((u) => u.pathname === `/vi/books/${BOOK}`);

  await page.getByRole("link", { name: /Unit 1|Thời gian rảnh/ }).first().click();
  await page.waitForURL((u) => u.pathname === `/vi/books/${BOOK}/units/1`);

  await page.locator(`a[href$="/lessons/1/listen-and-type"]`).first().click();
  await page.waitForURL((u) => u.pathname === `/vi${LESSON_PATH}`);

  await expect(page.locator("h1")).toContainText("Hoạt động thời gian rảnh");
  await expect(page.locator("audio").first()).toBeAttached();
  await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible();
});

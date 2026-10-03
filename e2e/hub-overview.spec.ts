import { expect, test, type Page } from "@playwright/test";
import { HUB_WORDS, seedHubProgress } from "./vocabulary-hub-fixture";

/**
 * E2E vocabulary hub (story vocabulary-hub SF-1 t-1.3): navbar item → hub 4
 * tab (Tổng quan active + 3 placeholder "sắp có") → KPI 3/1/1 (từ đang học /
 * đến hạn / thành thạo) → bảng từ đủ 3 trạng thái chip (Due/Mastered/
 * Learning) → filter status qua dropdown + filter book → empty-filter →
 * i18n vi/en → guest redirect login ?next. Tên spec `hub-overview` (né
 * testMatch `/vocabulary*` của config SF-2 — convention review-flow).
 * Fixture qa-hub-* seed/tidy qua globalSetup/teardown; bảng thiếu → setup
 * fail có hướng dẫn (không giả lập DB).
 */

const [ALPHA, BRAVO, CHARLIE] = HUB_WORDS;

function qaEmail(tag: string): string {
  return `qa-hub-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern review-flow.spec.ts) → trả email. */
async function registerUser(page: Page, displayName: string): Promise<string> {
  const email = qaEmail(displayName.replace(/[^a-z0-9]/gi, "").toLowerCase());
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  return email;
}

test.describe("Vocabulary hub overview (SF-1)", () => {
  test.setTimeout(120_000);

  test("EN: navbar → hub → KPI 3/1/1 → chips → filter status/book", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Hub EN");
    await seedHubProgress(email);

    // t-1.1: navbar item Vocabulary dẫn đúng route hub
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Vocabulary" })
      .click();
    await page.waitForURL(/\/en\/vocabulary$/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Vocabulary hub",
    );
    // shell 4 tab: Tổng quan active + 3 placeholder "Coming soon"
    await expect(page.getByText("Overview", { exact: true })).toBeVisible();
    for (const tab of ["Library", "Review", "Quiz"]) {
      // li gộp text tab + chip → filter theo hasText, không exact
      const item = page.getByRole("listitem").filter({ hasText: tab });
      await expect(item).toBeVisible();
      await expect(item).toContainText("Coming soon");
    }

    // KPI: 3 đang học · 1 đến hạn · 1 thành thạo
    const kpis = page.locator("dl > div");
    await expect(kpis.filter({ hasText: "Words learning" })).toContainText("3");
    await expect(kpis.filter({ hasText: "Due today" })).toContainText("1");
    await expect(kpis.filter({ hasText: "Mastered" })).toContainText("1");

    // bảng: 3 hàng, đúng chip trạng thái
    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(3);
    await expect(
      rows.filter({ hasText: ALPHA.word }),
    ).toContainText("Due");
    await expect(
      rows.filter({ hasText: BRAVO.word }),
    ).toContainText("Mastered");
    await expect(
      rows.filter({ hasText: CHARLIE.word }),
    ).toContainText("Learning");

    // filter status qua dropdown → chỉ bravo (mastered)
    await page
      .getByRole("combobox", { name: "Filter by status" })
      .click();
    await page.getByRole("option", { name: "Mastered" }).click();
    await expect(page).toHaveURL(/status=mastered/);
    await expect(rows).toHaveCount(1);
    await expect(rows.filter({ hasText: BRAVO.word })).toBeVisible();

    // filter book qua dropdown → level-3 giữ alpha + bravo (chờ URL reset
    // status xong mới bấm filter kế — router.push soft-nav commit bất đồng bộ)
    await page
      .getByRole("combobox", { name: "Filter by status" })
      .click();
    await page.getByRole("option", { name: "All statuses" }).click();
    await expect(page).toHaveURL(/\/en\/vocabulary$/);
    await page
      .getByRole("combobox", { name: "Filter by book" })
      .click();
    await page.getByRole("option", { name: "Level 3", exact: true }).click();
    await expect(page).toHaveURL(/book=3/);
    await expect(page).not.toHaveURL(/status=/);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: CHARLIE.word })).toHaveCount(0);
  });

  test("EN: book+status không khớp hàng nào → empty-filter", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Hub EN Filter");
    await seedHubProgress(email);
    await page.goto("/en/vocabulary?book=1&status=mastered");
    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(0);
    await expect(
      page.getByText("No words match these filters."),
    ).toBeVisible();
  });

  test("VI: nhãn i18n tiếng Việt — navbar/tab/chip/bảng", async ({ page }) => {
    const email = await registerUser(page, "QA Hub VI");
    await seedHubProgress(email);

    // register qua /en nên vào thẳng route VI; navbar VI dẫn đúng href
    await page.goto("/vi/vocabulary");
    const navLink = page
      .getByRole("navigation")
      .getByRole("link", { name: "Từ vựng" });
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute("href", /\/vi\/vocabulary$/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Tổng quan từ vựng",
    );
    await expect(page.getByText("Tổng quan", { exact: true })).toBeVisible();
    for (const tab of ["Thư viện", "Ôn tập", "Kiểm tra"]) {
      const item = page.getByRole("listitem").filter({ hasText: tab });
      await expect(item).toBeVisible();
      await expect(item).toContainText("Sắp có");
    }
    const kpis = page.locator("dl > div");
    await expect(kpis.filter({ hasText: "Từ đang học" })).toContainText("3");
    await expect(kpis.filter({ hasText: "Đến hạn hôm nay" })).toContainText("1");
    await expect(kpis.filter({ hasText: "Đã thành thạo" })).toContainText("1");

    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: ALPHA.word })).toContainText("Đến hạn");
    await expect(rows.filter({ hasText: BRAVO.word })).toContainText(
      "Thành thạo",
    );
    await expect(rows.filter({ hasText: CHARLIE.word })).toContainText(
      "Đang học",
    );
  });

  test("chưa đăng nhập → redirect login kèm ?next", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/vocabulary");
    await expect(page).toHaveURL(
      /\/en\/login\?next=%2Fen%2Fvocabulary|\/en\/login\?next=\/en\/vocabulary/,
    );
  });
});

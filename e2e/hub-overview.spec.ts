import { expect, test, type Page } from "@playwright/test";
import { HUB_WORDS, seedHubProgress } from "./vocabulary-hub-fixture";

/**
 * E2E vocabulary hub (story vocabulary-hub SF-1 t-1.3; SF-3 tab Review/Quiz
 * thành tab thật — hết placeholder): navbar item → hub 4 tab → KPI 3/1/1 (từ đang học /
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
    // shell 4 tab: Tổng quan active; cả Review/Quiz là link thật (SF-3 —
    // placeholder "Coming soon" đã bỏ)
    await expect(page.getByText("Overview", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Library" })
        .getByRole("link", { name: "Library" }),
    ).toBeVisible();
    for (const tab of ["Review", "Quiz"]) {
      const link = page
        .getByRole("listitem")
        .filter({ hasText: tab })
        .getByRole("link", { name: tab });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute(
        "href",
        `/en/vocabulary?tab=${tab.toLowerCase()}`,
      );
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
    await expect(
      page.getByRole("listitem")
        .filter({ hasText: "Thư viện" })
        .getByRole("link", { name: "Thư viện" }),
    ).toBeVisible();
    // tab Ôn tập/Kiểm tra là link thật (SF-3), href VI prefix locale
    for (const [label, tabPath] of [
      ["Ôn tập", "review"],
      ["Kiểm tra", "quiz"],
    ] as const) {
      const link = page
        .getByRole("listitem")
        .filter({ hasText: label })
        .getByRole("link", { name: label });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute(
        "href",
        `/vi/vocabulary?tab=${tabPath}`,
      );
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

  test("guest: mặc định tab Thư viện; đòi Tổng quan → login ?next (SF-2)", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/vocabulary");
    // guest duyệt được thư viện (không trạng thái) — không redirect thẳng
    await expect(
      page.getByRole("heading", { level: 2, name: "Word library" }),
    ).toBeVisible();
    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(3);
    await expect(page.getByText("SRS status")).toHaveCount(0);
    // Tổng quan là data cá nhân → link Overview dẫn login kèm ?next
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(
      /\/en\/login\?next=(%2F|\/)en(%2F|\/)vocabulary/,
    );
  });
});

import { expect, test } from "@playwright/test";
import { HUB_WORDS } from "./vocabulary-hub-fixture";

/**
 * E2E SMOKE vocabulary hub (migrate SF4) — tab Thư viện GUEST trên v2:
 * danh sách fixture qa-hub-* render, cột audio "—", guest đòi tab cá nhân →
 * login ?next. Đủ chứng minh: route /en/vocabulary + i18n en + DB words.
 * Fixture seed do smoke-global-setup (globalSetup) — teardown dọn qa-hub-*.
 */

const [ALPHA, BRAVO] = HUB_WORDS;

test.describe("Smoke: vocabulary hub guest @smoke", () => {
  test.setTimeout(120_000);

  test("EN guest: Thư viện render fixture qa-hub + guest gate tab Tổng quan", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/vocabulary?tab=library");
    await expect(
      page.getByRole("heading", { level: 2, name: "Word library" }),
    ).toBeVisible();

    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(3);
    // fixture không có audio → cột audio "—"
    await expect(rows.filter({ hasText: BRAVO.word })).toContainText("—");
    // guest vẫn bấm được "Learn this word" (duyệt không cần đăng nhập)
    await expect(
      rows
        .filter({ hasText: ALPHA.word })
        .getByRole("link", { name: "Learn this word" }),
    ).toBeVisible();

    // guest đòi tab cá nhân (Tổng quan) → link tab dẫn login kèm ?next quay
    // lại (gate ở tab link — server redirect không xảy ra: resolveHubTab
    // hạ guest overview → library, đúng ilec gốc)
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(/\/en\/login\?next=(%2F|\/)en(%2F|\/)vocabulary/);
  });
});

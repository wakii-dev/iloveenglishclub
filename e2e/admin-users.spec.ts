import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQaAccount,
  loginAsAdmin,
  roleOf,
  seedQaUser,
  userIdOf,
} from "./admin-lib";

/**
 * Users mgmt (spec slice 10 — ACCEPTANCE 4): đổi role trên account chuyên dụng
 * `sf4-user@test.ilec` (DB verify), chặn tự-đổi (UI disabled + "(bạn)" badge).
 * Fixture learner READ-ONLY (guard ở admin-gating.spec).
 * Gap "khóa user" → DEFERRED (schema thiếu cột `profiles.banned` — REQUIREDMENT-
 * GAP VU-15 ghi sẵn trong users.ts — registry QA-305).
 */

const QA_EMAIL = "sf4-user@test.ilec";

function rowOf(page: Page, email: string) {
  return page.locator("table tbody tr").filter({ hasText: email });
}

test.describe("Users mgmt (SF-4)", () => {
  test.beforeEach(async ({ page }) => {
    await seedQaUser(QA_EMAIL, "SF4 User");
    await loginAsAdmin(page);
    await page.goto("/admin/users");
  });

  test.afterAll(async () => {
    await cleanupQaAccount(QA_EMAIL);
  });

  test("search thấy account test + role khởi điểm user", async ({ page }) => {
    await page.getByRole("searchbox").fill(QA_EMAIL);
    await page.getByRole("searchbox").press("Enter");
    const row = rowOf(page, QA_EMAIL);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Người dùng");
    expect(await roleOf(QA_EMAIL)).toBe("user");
  });

  test("đổi role user→admin (UI) → DB thật; đổi ngược lại OK", async ({ page }) => {
    await page.getByRole("searchbox").fill(QA_EMAIL);
    await page.getByRole("searchbox").press("Enter");
    const row = rowOf(page, QA_EMAIL);

    await row.getByRole("combobox").click();
    await page.getByRole("option", { name: "Quản trị" }).click();
    // nguồn sự thật = DB (toast "Quản trị" trùng text option — không tin)
    await expect.poll(() => roleOf(QA_EMAIL)).toBe("admin");

    // đổi ngược — action chạy cả 2 chiều
    await row.getByRole("combobox").click();
    await page.getByRole("option", { name: "Người dùng", exact: true }).click();
    await expect.poll(() => roleOf(QA_EMAIL)).toBe("user");
    await expect(row).toContainText("Người dùng");
  });

  test("self-row: select disabled + badge (bạn) — không tự hạ được mình", async ({
    page,
  }) => {
    // row admin đang đăng nhập (ADMIN_EMAIL từ .env.local)
    const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
    expect(adminEmail).toBeTruthy();
    const row = rowOf(page, adminEmail);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("(bạn)");
    await expect(row.getByRole("combobox")).toBeDisabled();
    // DB sanity: admin thật vẫn admin (không ai đổi được qua UI)
    expect(await roleOf(adminEmail)).toBe("admin");
  });

  test("learner fixture không bị đụng (READ-ONLY — vẫn user sau mọi run)", async () => {
    expect(await roleOf("e2e-learner@example.com")).toBe("user");
    void userIdOf; // import giữ cho gating helper parity
  });
});

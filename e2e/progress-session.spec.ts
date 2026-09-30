import { expect, test, type Page } from "@playwright/test";

/**
 * E2E SF-3 QA (context pack #5 — session lifecycle): logout sạch (UserMenu →
 * Log out → header guest), protected routes (/me locale-aware redirect kèm
 * ?next; /admin middleware + layout role-gate 2 lớp), cookie contract
 * (authjs.session-token httpOnly — không đọc được bằng JS). Expiry: JWT
 * strategy mặc định 30 ngày — không đợi được thật, probe config + cookie
 * attrs thay thế (ghi evidence).
 */

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

async function registerAndLogin(page: Page, displayName: string) {
  const email = sf3Email(displayName);
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

test.describe("Session lifecycle (SF-3)", () => {
  test.setTimeout(360_000);

  test("logout: UserMenu → Log out → header về guest, route bảo vệ chặn lại", async ({
    page,
  }) => {
    const displayName = "SF3 Logout";
    await registerAndLogin(page, displayName);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: /^log in$/i })).toHaveCount(
      0,
      { timeout: 15_000 },
    );

    // Mở dropdown user — trigger là nút CHỨA displayName (header còn nút
    // theme/locale: first() trúng nhầm → menuitem không bao giờ hiện, đã ăn
    // timeout 6p ở run đầu)
    await header
      .getByRole("button", { name: new RegExp(displayName) })
      .click();
    await page.getByRole("menuitem", { name: /log out/i }).click();

    // signOut redirectTo /en → header guest trở lại
    await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
    await expect(
      header.getByRole("link", { name: /^log in$/i }),
    ).toBeVisible({ timeout: 15_000 });

    // Sau logout, /me phải chặn lại (cookie đã xoá)
    await page.goto("/en/me", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname.endsWith("/login"), {
      timeout: 30_000,
    });
    expect(page.url()).toContain("next=");
  });

  test("/me guest → redirect login kèm ?next đúng locale", async ({ page }) => {
    await page.context().clearCookies();

    await page.goto("/en/me", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/en/login", {
      timeout: 30_000,
    });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/en/me");

    // Locale vi: redirect giữ nguyên ngữ cảnh
    await page.goto("/vi/me", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/vi/login", {
      timeout: 30_000,
    });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/vi/me");
  });

  test("/admin guest → middleware redirect login?next=/admin; user thường → layout chặn về /", async ({
    page,
  }) => {
    // Lớp 1 — guest (middleware): chưa login
    await page.context().clearCookies();
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/en/login", {
      timeout: 30_000,
    });
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");

    // Lớp 2 — user thường (layout role-gate): redirect về /
    await registerAndLogin(page, "SF3 NotAdmin");
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/admin/);
  });

  test("cookie session: authjs.session-token httpOnly (không đọc được bằng JS)", async ({
    page,
  }) => {
    await registerAndLogin(page, "SF3 Cookie");
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name.includes("session-token"));
    expect(session, "session cookie phải tồn tại sau login").toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    // SameSite chặn CSRF cross-site cơ bản
    expect(["Lax", "Strict"]).toContain(session!.sameSite);
  });
});

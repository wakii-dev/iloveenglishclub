import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * E2E SF-3 QA (context pack #2 — login edge): sai mật khẩu → invalidCredentials;
 * `next` param guard (open-redirect — ĐẶC BIỆT probe `//evil.com`
 * protocol-relative: server guard chỉ `startsWith("/")` nên protocol-relative
 * VƯỢT guard chuỗi — quyết định cuối thuộc Auth.js redirectTo validation,
 * probe thật + route-intercept để bắt nếu có chuyển hướng off-origin);
 * `?next=/en/me` hợp lệ → đăng nhập xong về đúng trang; không next → /{locale}.
 */

const INVALID_CRED_EN = /incorrect email or password/i;

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

async function submitLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: /log in|đăng nhập/i })
    .click();
}

/** Register qua API UI nhanh (setup user cho login tests). */
async function registerUser(page: Page, displayName: string): Promise<string> {
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

test.describe("Login edge (SF-3)", () => {
  test.setTimeout(360_000);

  test("sai mật khẩu → invalidCredentials, ở lại trang login", async ({
    page,
  }) => {
    const email = await registerUser(page, "SF3 Login");
    await page.context().clearCookies();

    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await submitLogin(page, email, "wrong-password-1");
    await expect(
      page.locator("form").getByRole("alert"),
    ).toContainText(INVALID_CRED_EN);
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("next tuyệt đối off-origin bị từ chối → về /{locale} (không evil.com)", async ({
    page,
  }) => {
    const email = await registerUser(page, "SF3 AbsNext");
    await page.context().clearCookies();

    // Chặn mọi request tới evil.com — nếu guard lọt, redirect sẽ bị capture
    let evilHit: string | null = null;
    // Intercept theo HOSTNAME — pattern substring (/evil\.com/) bắt nhầm cả
    // URL trang login (query ?next= chứa "evil.com") → trang render body giả
    // (đã ăn: 2 test probe fail vì form không render).
    const captureEvil = (route: Route) => {
      let host = "";
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        host = "";
      }
      if (host.endsWith("evil.com")) {
        evilHit = route.request().url();
        return route.fulfill({ status: 200, body: "EVIL-CAPTURED" });
      }
      return route.fallback();
    };
    await page.route("**/*", captureEvil);

    await page.goto("/en/login?next=https://evil.com/path", {
      waitUntil: "domcontentloaded",
    });
    await submitLogin(page, email, "password123");
    await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
    expect(evilHit).toBeNull(); // không hề có request off-origin
  });

  test("probe protocol-relative //evil.com — Auth.js phải giữ on-origin", async ({
    page,
  }) => {
    const email = await registerUser(page, "SF3 ProtoRel");
    await page.context().clearCookies();

    let evilHit: string | null = null;
    // Intercept theo HOSTNAME — pattern substring (/evil\.com/) bắt nhầm cả
    // URL trang login (query ?next= chứa "evil.com") → trang render body giả
    // (đã ăn: 2 test probe fail vì form không render).
    const captureEvil = (route: Route) => {
      let host = "";
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        host = "";
      }
      if (host.endsWith("evil.com")) {
        evilHit = route.request().url();
        return route.fulfill({ status: 200, body: "EVIL-CAPTURED" });
      }
      return route.fallback();
    };
    await page.route("**/*", captureEvil);

    await page.goto("/en/login?next=//evil.com/pwn", {
      waitUntil: "domcontentloaded",
    });
    await submitLogin(page, email, "password123");

    // Contract (QA-200): protocol-relative phải được normalize về nội bộ —
    // login thành công → về /{locale}; TUYỆT ĐỐI không rời origin (evilHit
    // null) và không client-side exception (trên code trước fix: NEXT_REDIRECT
    // "//evil.com/pwn" làm Next router nổ "Application error").
    await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
    expect(
      evilHit,
      "protocol-relative next KHÔNG được rời origin (open-redirect)",
    ).toBeNull();
    expect(new URL(page.url()).hostname).toBe("localhost");
    await expect(page.getByText(/application error/i)).toHaveCount(0);
  });

  test("?next=/en/me hợp lệ → login xong về /en/me; không next → /en", async ({
    page,
  }) => {
    const email = await registerUser(page, "SF3 NextMe");
    await page.context().clearCookies();

    await page.goto("/en/login?next=/en/me", { waitUntil: "domcontentloaded" });
    await submitLogin(page, email, "password123");
    await page.waitForURL((u) => u.pathname === "/en/me", { timeout: 30_000 });

    // Không next → về /{locale} của form (en)
    await page.context().clearCookies();
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await submitLogin(page, email, "password123");
    await page.waitForURL((u) => u.pathname === "/en", { timeout: 30_000 });
  });
});

import { expect, test, type Page } from "@playwright/test";

/**
 * E2E SF-3 QA — REGRESSION cho fix 695f0ef (session-sync.tsx, papercut
 * "header còn guest sau register/login"): login/register chạy Server Action →
 * Auth.js set cookie rồi NEXT_REDIRECT — client-side navigation KHÔNG báo
 * SessionProvider → useSession() giữ state guest → header hiện "Log in" dù
 * đã đăng nhập (phải F5). Fix: SessionSync refetch session trên pathname
 * change. Test này đi path register THẬT qua UI và KHÔNG BAO GIỜ reload —
 * header phải hiện displayName ngay sau redirect.
 *
 * Mutation-RED đã chạy (task 4 evidence): revert providers.tsx về
 * 695f0ef~1 (không mount SessionSync) → 2 test FAIL (header guest treo) →
 * restore → GREEN. Sau khi regression GREEN, workaround `page.reload()`
 * trong progress.spec.ts được BỎ (boundary: test trước, bỏ sau).
 */

function sf3Email(tag: string): string {
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Header đã ở trạng thái đăng nhập: displayName hiện, nút guest biến mất. */
async function expectHeaderLoggedIn(page: Page, displayName: string) {
  const header = page.getByRole("banner");
  await expect(
    header.getByText(displayName),
    "header phải hiện user NGAY sau server-action redirect (SessionSync 695f0ef) — không F5",
  ).toBeVisible({ timeout: 15_000 });
  await expect(header.getByRole("link", { name: /^log in$/i })).toHaveCount(0);
}

test.describe("SessionSync regression (SF-3 — fix 695f0ef)", () => {
  test.setTimeout(360_000);

  test("register path thật (không reload) → header hiện displayName ngay", async ({
    page,
  }) => {
    const displayName = `SF3 Sync ${Date.now() % 100000}`;
    const email = sf3Email("sync");

    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up|đăng ký/i })
      .click();
    await page.waitForURL(/\/en$/);

    // KHÔNG reload — SessionSync phải tự refetch session khi pathname đổi
    await expectHeaderLoggedIn(page, displayName);
  });

  test("login path thật (không reload) → header hiện displayName ngay", async ({
    page,
  }) => {
    const displayName = `SF3 Login Sync ${Date.now() % 100000}`;
    const email = sf3Email("loginsync");

    // Setup: register (chính nó cũng là path không-reload)
    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/display name|tên hiển thị/i).fill(displayName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up|đăng ký/i })
      .click();
    await page.waitForURL(/\/en$/);

    // Logout bằng clearCookies → full load login (trạng thái guest sạch)
    await page.context().clearCookies();
    await page.goto("/en/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();
    await page.waitForURL(/\/en$/);

    await expectHeaderLoggedIn(page, displayName);
  });
});

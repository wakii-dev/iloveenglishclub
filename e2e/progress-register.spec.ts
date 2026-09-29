import { expect, test, type Page } from "@playwright/test";
import { profileMetaOf, userCountByEmail } from "./db";

/**
 * E2E SF-3 QA (context pack #1 — register edge): duplicate email → thông
 * điệp emailTaken (en+vi), locale profile auto-set theo route đăng ký
 * (spec §8 ACCEPTANCE SF-1), validation (server invalidEmail / browser
 * weakPassword), transactional (user + profiles cùng tồn tại — login được
 * ngay, không orphan user).
 */

const EMAIL_TAKEN_EN = /account with this email already exists/i;
const EMAIL_TAKEN_VI = /Email này đã được dùng/i;
const INVALID_EMAIL_EN = /valid email/i;

function sf3Email(tag: string): string {
  // lowercase + chỉ ký tự email-an toàn (registerAction lowercase server-side)
  return `sf3-${tag.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Fill + submit form register (không assert kết quả — caller tự assert). */
async function submitRegister(
  page: Page,
  fields: { displayName: string; email: string; password: string },
): Promise<void> {
  await page.getByLabel(/display name|tên hiển thị/i).fill(fields.displayName);
  await page.getByLabel(/email/i).fill(fields.email);
  await page.getByLabel(/password|mật khẩu/i).fill(fields.password);
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
}

/** Alert lỗi của form — scope trong form để KHÔNG trúng __next-route-announcer__
 *  (Next gắn div role=alert ẩn; strict mode violation đã ăn run đầu). */
function formAlert(page: Page) {
  return page.locator("form").getByRole("alert");
}

test.describe("Register edge (SF-3)", () => {
  // Dev server compile lạnh register page + auth action lần đầu (~60-115s đã
  // đo trên serverwarm khác) — timeout suite rộng, poll cụ thể hẹp bên trong.
  test.setTimeout(360_000);

  test("duplicate email → emailTaken (en), KHÔNG tạo user thứ 2", async ({
    page,
  }) => {
    const email = sf3Email("dup");

    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await submitRegister(page, {
      displayName: "SF3 Dup",
      email,
      password: "password123",
    });
    await page.waitForURL(/\/en$/); // đăng ký lần 1 thành công → auto login

    // Lần 2 cùng email (context mới — guest, tránh nav state user cũ)
    const page2 = await page.context().newPage();
    await page2.context().clearCookies();
    await page2.goto("/en/register", { waitUntil: "domcontentloaded" });
    await submitRegister(page2, {
      displayName: "SF3 Dup Again",
      email,
      password: "password123",
    });
    await expect(formAlert(page2)).toContainText(EMAIL_TAKEN_EN);
    // Vẫn ở trang register (không redirect home)
    await expect(page2).toHaveURL(/\/en\/register/);
    await page2.close();

    // Contract: chỉ MỘT user row (23505 chặn, không upsert)
    await expect.poll(() => userCountByEmail(email)).toBe(1);
  });

  test("duplicate email → thông điệp tiếng Việt trên route /vi", async ({
    page,
  }) => {
    const email = sf3Email("dupvi");

    await page.goto("/vi/register", { waitUntil: "domcontentloaded" });
    await submitRegister(page, {
      displayName: "SF3 Trùng",
      email,
      password: "password123",
    });
    await page.waitForURL(/\/vi$/);

    const page2 = await page.context().newPage();
    await page2.context().clearCookies();
    await page2.goto("/vi/register", { waitUntil: "domcontentloaded" });
    await submitRegister(page2, {
      displayName: "SF3 Trùng Lại",
      email,
      password: "password123",
    });
    await expect(formAlert(page2)).toContainText(EMAIL_TAKEN_VI);
    await page2.close();
  });

  test("locale profile auto-set theo route: /vi → profile.locale=vi (transactional: có profile ngay)", async ({
    page,
  }) => {
    const email = sf3Email("locale");

    await page.goto("/vi/register", { waitUntil: "domcontentloaded" });
    await submitRegister(page, {
      displayName: "SF3 Ngữ",
      email,
      password: "password123",
    });
    await page.waitForURL(/\/vi$/);

    // Transactional user+profile: profile row tồn tại NGAY với locale route
    await expect
      .poll(() => profileMetaOf(email), { timeout: 30_000 })
      .toEqual({ locale: "vi", displayName: "SF3 Ngữ" });
  });

  test("validation: email không TLD → invalidEmail server-side; mật khẩu <8 bị browser chặn", async ({
    page,
  }) => {
    await page.goto("/en/register", { waitUntil: "domcontentloaded" });

    // "a@b" qua được HTML5 type=email (không cần TLD) nhưng FAIL EMAIL_RE
    // server (`\.[^\s@]+`) → action trả invalidEmail
    await submitRegister(page, {
      displayName: "SF3 Bad",
      email: `sf3-bad-${Date.now()}@tld-less`,
      password: "password123",
    });
    await expect(formAlert(page)).toContainText(INVALID_EMAIL_EN);
    await expect(page).toHaveURL(/\/en\/register/);

    // weakPassword: minLength=8 → browser chặn submit (không navigate, không
    // gọi server — message validation của input hiển thị bởi browser)
    const pw = page.getByLabel(/password/i);
    await pw.fill("short");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up/i })
      .click();
    await expect(page).toHaveURL(/\/en\/register/);
    const validity = await pw.evaluate(
      (el: HTMLInputElement) => el.validationMessage,
    );
    expect(validity).not.toBe(""); // browser hiển thị lý do chặn
  });
});

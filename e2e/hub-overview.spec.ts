import { expect, test, type Page } from "@playwright/test";
import { seedHubProgress } from "./vocabulary-hub-fixture";

/**
 * E2E vocabulary hub tab Tổng quan (SF-4 dashboard rewrite, VU-41 — trước đây
 * là KPI/bảng từ của story vocabulary-hub): tab overview giờ là DASHBOARD
 * Memrise-style — assert các khối dashboard hiện (continue card + goal ring +
 * streak/due + vườn + lộ trình), tab hrefs giữ nguyên, i18n vi/en, guest
 * redirect login ?next như cũ. Số liệu chính (đối chiếu fixture khớp số) ở
 * suite dashboard 3319 (fixture qa-dash-* kiểm soát được) — suite này chỉ pin
 * khối + nhãn (book_words template DB không kiểm soát được số).
 */

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

test.describe("Vocabulary hub — tab Tổng quan dashboard (SF-4)", () => {
  test.setTimeout(120_000);

  test("EN: dashboard khối + tab hrefs giữ nguyên (?tab= contract)", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Hub EN");
    await seedHubProgress(email);

    // t-1.1 cũ: navbar item Vocabulary dẫn đúng route hub
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Vocabulary" })
      .click();
    await page.waitForURL(/\/en\/vocabulary$/);

    // dashboard: h1 riêng "Chào {name}" (page h1 hub.title chỉ ở tab khác)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hi QA Hub EN",
    );
    // shell 4 tab: Tổng quan active; Review/Quiz link thật — contract ?tab=
    await expect(page.getByText("Overview", { exact: true })).toBeVisible();
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

    // các khối dashboard hiện: continue card (href learn/[book] — KHÔNG
    // navigate, SF-3), goal ring aria, vườn, lộ trình
    const continueCta = page.getByRole("link", { name: /Learn \d+ new words/ });
    await expect(continueCta).toBeVisible();
    await expect(continueCta).toHaveAttribute(
      "href",
      /\/en\/vocabulary\/learn\/\d+/,
    );
    await expect(
      page.locator('[role="img"][aria-label*="Today\'s goal"]'),
    ).toBeVisible();
    await expect(page.getByText("Word garden")).toBeVisible();
    await expect(page.getByText(/Roadmap of \d+ books/)).toBeVisible();
  });

  test("VI: nhãn i18n dashboard tiếng Việt — navbar/tab/khối", async ({
    page,
  }) => {
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
      "Chào QA Hub VI",
    );
    await expect(page.getByText("Tổng quan", { exact: true })).toBeVisible();
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
    // khối dashboard vi
    await expect(
      page.locator('[role="img"][aria-label*="Mục tiêu hôm nay"]'),
    ).toBeVisible();
    await expect(page.getByText("Vườn từ vựng")).toBeVisible();
    await expect(page.getByText(/Lộ trình \d+ sách/)).toBeVisible();
    const continueCta = page.getByRole("link", { name: /Học \d+ từ mới/ });
    await expect(continueCta).toBeVisible();
    await expect(continueCta).toHaveAttribute(
      "href",
      /\/vi\/vocabulary\/learn\/\d+/,
    );
  });

  test("guest: mặc định tab Thư viện; đòi Tổng quan → login ?next (không regression)", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/vocabulary");
    // guest duyệt được thư viện (không trạng thái) — không redirect thẳng
    await expect(
      page.getByRole("heading", { level: 2, name: "Word library" }),
    ).toBeVisible();
    await expect(page.getByText("Today's goal")).toHaveCount(0);
    // Tổng quan là data cá nhân → link Overview dẫn login kèm ?next
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(
      /\/en\/login\?next=(%2F|\/)en(%2F|\/)vocabulary/,
    );
  });
});

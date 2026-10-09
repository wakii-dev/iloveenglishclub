import { expect, test, type Page } from "@playwright/test";
import {
  DASH_BOOK_SLUG,
  seedDashboardProgress,
} from "./vocabulary-dashboard-fixture";

/**
 * E2E dashboard home Memrise-style (vocab-memrise SF-4, VU-41 — context pack
 * mục 9 + acceptance 1-6). Số liệu pin fixture `qa-dash-*` (xem
 * vocabulary-dashboard-fixture.ts header): garden [3,2,1,1,1,0,0,5] · continue
 * Level 2 · Từ 11–20 · 0/10 planted · ring 3/5 · streak 2 · due 1 · XP 1248 ·
 * lộ trình: 3 books (level-1 0/6 Chưa bắt đầu, level-5 10/25, level-6 0/10).
 * Continue-card CHỈ assert href — KHÔNG navigate vào learn runner (route SF-3
 * có thể chưa merge). Goal chỉnh qua UI → PATCH → reload giữ (acceptance #2).
 */

function qaEmail(tag: string): string {
  return `qa-dash-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern hub-overview.spec) → trả email. */
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

test.describe("Vocabulary dashboard home (SF-4)", () => {
  test.setTimeout(120_000);

  test("VI: dashboard đúng số fixture — continue/ring/streak/due/XP/vườn/lộ trình", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Dash VI");
    await seedDashboardProgress(email);

    await page.goto("/vi/vocabulary");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Chào QA Dash VI",
    );
    // XP pill — format vi-VN (dấu chấm ngăn nghìn)
    await expect(page.getByText("1.248 XP")).toBeVisible();

    // continue card: level kế tiếp = Level 2 (từ 11–20, 10 từ mới) — CHỈ
    // assert href, KHÔNG navigate vào learn runner (SF-3)
    const continueCta = page.getByRole("link", { name: /Học 10 từ mới/ });
    await expect(continueCta).toBeVisible();
    await expect(continueCta).toHaveAttribute(
      "href",
      `/vi/vocabulary/learn/${DASH_BOOK_SLUG}`,
    );
    await expect(
      page.getByText("Level 2 · Từ 11–20 — còn 10 từ mới trong level"),
    ).toBeVisible();
    await expect(page.getByText("0/10 từ trong level")).toBeVisible();

    // goal ring 3/5 planted-hôm-nay/goal + text alternative (a11y acceptance #6)
    const ring = page.locator('[role="img"][aria-label*="Mục tiêu hôm nay"]');
    await expect(ring).toHaveAttribute(
      "aria-label",
      "Mục tiêu hôm nay: 3 trên 5 từ mới",
    );
    await expect(page.getByText("3/5", { exact: true })).toBeVisible();

    // streak + due (đối chiếu fixture)
    await expect(page.getByText("2 ngày", { exact: true })).toBeVisible();
    await expect(page.getByText("1 từ", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ôn ngay" }),
    ).toHaveAttribute("href", "/vi/me/vocabulary?scope=all");

    // garden: tổng 13 từ + legend stage từ learn.json
    await expect(page.getByText("13 từ đang lớn dần")).toBeVisible();
    await expect(page.getByText("0 Hạt mầm")).toBeVisible();
    await expect(page.getByText("7 Nở hoa")).toBeVisible();
    const garden = page.locator('section[aria-label*="Vườn từ vựng"]');
    await expect(garden).toBeVisible();

    // lộ trình 3 books: level-1 0/6 · level-5 10/25 Đang học · level-6 0/10 Chưa bắt đầu
    await expect(page.getByText("Lộ trình 3 sách")).toBeVisible();
    await expect(page.getByText("10/25", { exact: true })).toBeVisible();
    await expect(page.getByText("0/10", { exact: true })).toBeVisible();
    await expect(page.getByText("Đang học", { exact: true })).toBeVisible();
    // level-1 (0/6) + level-6 (0/10) đều Chưa bắt đầu
    await expect(page.getByText("Chưa bắt đầu", { exact: true })).toHaveCount(2);
  });

  test("goal 5→10 qua popover → reload giữ 10, ring cập nhật (acceptance #2)", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Dash Goal");
    await seedDashboardProgress(email);
    await page.goto("/vi/vocabulary");

    await expect(page.getByText("3/5", { exact: true })).toBeVisible();
    // mở popover (pre-hydration click race — retry qua expect+click)
    const editBtn = page.getByRole("button", { name: /Sửa mục tiêu/ });
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    const preset10 = page.getByRole("button", { name: "10", exact: true });
    await expect(preset10).toBeVisible();
    await preset10.click();

    // PATCH xong đóng popover + refresh RSC — ring 3/10
    await expect(page.getByText("3/10", { exact: true })).toBeVisible();
    await expect(
      page.locator('[role="img"][aria-label="Mục tiêu hôm nay: 3 trên 10 từ mới"]'),
    ).toBeVisible();

    // reload — goal persist từ profiles
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("3/10", { exact: true })).toBeVisible();
    await expect(
      page.locator('[role="img"][aria-label="Mục tiêu hôm nay: 3 trên 10 từ mới"]'),
    ).toBeVisible();
  });

  test("EN: labels + href en + số format en-US", async ({ page }) => {
    const email = await registerUser(page, "QA Dash EN");
    await seedDashboardProgress(email);
    await page.goto("/en/vocabulary");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hi QA Dash EN",
    );
    await expect(page.getByText("1,248 XP")).toBeVisible();
    const continueCta = page.getByRole("link", { name: /Learn 10 new words/ });
    await expect(continueCta).toHaveAttribute(
      "href",
      `/en/vocabulary/learn/${DASH_BOOK_SLUG}`,
    );
    await expect(
      page.getByText("Level 2 · Words 11–20 — 10 new words left in this level"),
    ).toBeVisible();
    await expect(
      page.locator('[role="img"][aria-label="Today\'s goal: 3 of 5 new words"]'),
    ).toBeVisible();
    await expect(page.getByText("Word garden")).toBeVisible();
  });

  test("dark toggle: class dark scope container + persist localStorage", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Dash Dark");
    await seedDashboardProgress(email);
    await page.goto("/vi/vocabulary");

    const container = page.locator("#vocab-dashboard");
    await expect(container).not.toHaveClass(/dark/);
    await page
      .getByRole("button", { name: "Chuyển chế độ tối" })
      .click();
    await expect(container).toHaveClass(/dark/);
    // bấm lại → sáng
    await page
      .getByRole("button", { name: "Chuyển chế độ sáng" })
      .click();
    await expect(container).not.toHaveClass(/dark/);
    // dark lần nữa → reload giữ (localStorage ilec.vocab-theme)
    await page
      .getByRole("button", { name: "Chuyển chế độ tối" })
      .click();
    await expect(container).toHaveClass(/dark/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#vocab-dashboard")).toHaveClass(/dark/);
  });

  test("mobile 375: dashboard cuộn dùng được — các khối hiện đủ", async ({
    page,
  }) => {
    const email = await registerUser(page, "QA Dash Mobile");
    await seedDashboardProgress(email);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/vi/vocabulary");

    await expect(
      page.getByRole("heading", { level: 1, name: "Chào QA Dash Mobile" }),
    ).toBeVisible();
    for (const block of [
      page.getByRole("link", { name: /Học 10 từ mới/ }),
      page.getByText("13 từ đang lớn dần"),
      page.getByText("Lộ trình 3 sách"),
    ]) {
      await expect(block).toBeVisible();
      await block.scrollIntoViewIfNeeded();
    }
    // không tràn ngang (scroll-width bằng viewport — dashboard cuộn dọc)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("guest: /vi/vocabulary → Thư viện; đòi Tổng quan → login ?next (không regression)", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/vi/vocabulary");
    await expect(
      page.getByRole("heading", { level: 2, name: "Thư viện từ vựng" }),
    ).toBeVisible();
    // dashboard cá nhân không render cho guest
    await expect(page.getByText("Mục tiêu hôm nay")).toHaveCount(0);
    await page.getByRole("link", { name: "Tổng quan" }).click();
    await expect(page).toHaveURL(
      /\/vi\/login\?next=(%2F|\/)vi(%2F|\/)vocabulary/,
    );
  });
});

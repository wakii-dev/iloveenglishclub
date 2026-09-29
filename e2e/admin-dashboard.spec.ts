import { expect, test } from "@playwright/test";
import { adminStats } from "./db";
import { loginAsAdmin } from "./admin-lib";

/**
 * Dashboard stats khớp DB thật (spec slice 3 — ACCEPTANCE 1): 6 stat card UI
 * đối chiếu SQL trực tiếp (adminStats() — cùng định nghĩa getAdminDashboard),
 * + 1 dòng perBook (level-3) đối chiếu 5 số. Spec re-runnable DB BẤT KỲ — mọi
 * expected lấy từ SQL tại thời điểm chạy, không hardcode count seed.
 */

const LABELS = {
  publishedLessons: "Bài đã xuất bản",
  draftLessons: "Bài nháp",
  parts: "Câu hỏi (parts)",
  partsMissingAudio: "Câu thiếu audio",
  users: "Người dùng",
  newUsers7d: "Người mới (7 ngày)",
} as const;

async function statValue(page: import("@playwright/test").Page, label: string): Promise<number> {
  // Scope grid đầu của main (stat cards) — tránh va text cùng tên ở nav "Người dùng"
  const card = page.locator("main .grid").first().locator("> *").filter({ hasText: label });
  await expect(card).toHaveCount(1);
  const raw = await card.locator("p").first().innerText();
  return Number.parseInt(raw.replace(/\D/g, ""), 10);
}

test.describe("Admin dashboard stats (SF-4)", () => {
  test("6 stat card khớp SQL trực tiếp", async ({ page }) => {
    const stats = await adminStats();
    await loginAsAdmin(page);
    await expect(page).toHaveURL((u) => u.pathname === "/admin");
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

    expect(await statValue(page, LABELS.publishedLessons)).toBe(stats.publishedLessons);
    expect(await statValue(page, LABELS.draftLessons)).toBe(stats.lessons - stats.publishedLessons);
    expect(await statValue(page, LABELS.parts)).toBe(stats.parts);
    expect(await statValue(page, LABELS.partsMissingAudio)).toBe(stats.partsMissingAudio);
    expect(await statValue(page, LABELS.users)).toBe(stats.users);
    expect(await statValue(page, LABELS.newUsers7d)).toBe(stats.newUsers7d);
  });

  test("perBook: dòng level-3 khớp SQL (units/bài XB/tổng/câu/thiếu)", async ({ page }) => {
    const stats = await adminStats();
    const l3 = stats.books.find((b) => b.slug === "level-3");
    expect(l3, "book level-3 phải tồn tại (seed core)").toBeTruthy();

    await loginAsAdmin(page);
    const row = page.locator("table tbody tr").filter({ hasText: l3!.title });
    await expect(row).toHaveCount(1);
    const cells = row.locator("td");
    await expect(cells.nth(1)).toHaveText(String(l3!.units));
    await expect(cells.nth(2)).toHaveText(`${l3!.published}/${l3!.lessons}`);
    await expect(cells.nth(3)).toHaveText(String(l3!.parts));
    await expect(cells.nth(4)).toHaveText(String(l3!.missing));
  });
});

import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./admin-lib";

/**
 * Nav "Từ vựng" (VU-43 SF-2 t1 — §6.7 PHẦN có surface trong worktree sf-2):
 * - active trên /admin/vocabulary (trước đây 404)
 * - KHÔNG double-active với "Crawl" trên /admin/vocabulary/crawl (tranh
 *   prefix /admin/vocabulary* — rule explicit adminNavActive, unit test kèm)
 * Active trên /admin/vocabulary/curation DEFERRED cho SF-4 convergence
 * (curation page không tồn tại trong worktree này — spec §6.7 pin).
 */

test.describe.configure({ mode: "serial" });

const VOCAB_NAV = "Từ vựng";
const CRAWL_NAV = "Crawl Oxford";

async function gotoAdmin(page: Page, path: string): Promise<void> {
  await loginAsAdmin(page);
  // compile lạnh route admin lần đầu có thể >30s (bài học SF-6) — nới timeout
  await page.goto(path, { timeout: 120_000 });
  await expect(page).toHaveURL((u) => u.pathname === path);
}

test.describe("Admin nav Từ vựng (SF-2)", () => {
  test("active trên /admin/vocabulary + sub-nav Catalog active", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/vocabulary");

    // Nav item "Từ vựng" active — items khác không
    const vocabItem = page.getByRole("link", { name: VOCAB_NAV, exact: true });
    await expect(vocabItem).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Sách", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: CRAWL_NAV, exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // Trang render sub-nav tier-0 — tab Catalog active (pathname chính xác)
    const subnav = page.getByRole("navigation", { name: "Vocabulary CMS" });
    await expect(
      subnav.getByRole("link", { name: "Catalog", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      subnav.getByRole("link", { name: "Curation", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("trên /admin/vocabulary/crawl: CHỈ Crawl active (không double)", async ({
    page,
  }) => {
    await gotoAdmin(page, "/admin/vocabulary/crawl");

    await expect(
      page.getByRole("link", { name: CRAWL_NAV, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: VOCAB_NAV, exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // Crawl dashboard render thật (VU-32 surface — không đụng)
    await expect(
      page.getByRole("heading", { name: "Crawl Oxford", exact: true }),
    ).toBeVisible();
  });
});

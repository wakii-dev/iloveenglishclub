import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./admin-lib";

/**
 * E2E stats dashboard (VU-43 SF-4 t1-t5 — spec §2.3/§6.5, playwright.admin
 * config). DB dùng chung (data thật) → assertion DATA-INDEPENDENT: format %,
 * thứ tự sort, tổng bars = tổng words (§5.8 trên UI thật), link sub-nav hết
 * 404 (phase-1 dead-link gỡ). Data-khớp-SQL là vitest contract test
 * (cms-stats-contract.integration.test.ts — cùng DB, ownership §8).
 */

test.describe.configure({ mode: "serial" });

test.setTimeout(180_000); // compile lạnh webpack + shared Neon

async function gotoStats(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/vocabulary/stats", { timeout: 120_000 });
  await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary/stats");
  // data về (skeleton biến mất) — compile lạnh route lần đầu có thể chậm
  await expect(page.getByTestId("stat-total")).toBeVisible({ timeout: 90_000 });
}

async function openStatsViaSubNav(page: Page, from: string): Promise<void> {
  await loginAsAdmin(page);
  await page.goto(from, { timeout: 120_000 });
  const subnav = page.getByRole("navigation", { name: "Vocabulary CMS" });
  await expect(subnav.getByRole("link", { name: "Thống kê" })).toBeVisible({
    timeout: 90_000,
  });
  await subnav.getByRole("link", { name: "Thống kê" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary/stats");
  await expect(
    page.getByRole("heading", { name: "Thống kê từ vựng" }),
  ).toBeVisible();
}

test.describe("Stats dashboard /admin/vocabulary/stats (SF-4)", () => {
  test("t1+t2: 5 thẻ số đúng format — % 1 thập phân hoặc 0%, số nguyên tabular", async ({
    page,
  }) => {
    await gotoStats(page);

    await expect(
      page.getByRole("heading", { name: "Thống kê từ vựng" }),
    ).toBeVisible();

    // Tổng words: số nguyên; coverage %: pin format "0%" hoặc "N.N%"
    const total = page.getByTestId("stat-total");
    await expect(total).toHaveText(/^\d+$/);
    for (const key of ["stat-audio", "stat-image", "stat-enriched"]) {
      await expect(page.getByTestId(key)).toHaveText(/^(0%|\d+\.\d+%)$/);
    }
    await expect(page.getByTestId("stat-orphan")).toHaveText(/^\d+$/);

    // Sub-nav: Stats active (hết 404 từ trang chính nó)
    const subnav = page.getByRole("navigation", { name: "Vocabulary CMS" });
    await expect(
      subnav.getByRole("link", { name: "Thống kê" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      subnav.getByRole("link", { name: "Catalog", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("t3: histogram 8 buckets — UI assertion TỔNG bars = tổng words (§5.8)", async ({
    page,
  }) => {
    await gotoStats(page);

    const values = page.getByTestId("histogram-value");
    await expect(values).toHaveCount(8); // A1..C2 + untagged + other (kể cả 0)

    // Tổng các cột (UI thật) = thẻ tổng words — pin context pack t3
    const total = await page.getByTestId("stat-total").textContent();
    const barSum = (await values.allTextContents())
      .map((s) => Number(s))
      .reduce((a, b) => a + b, 0);
    expect(String(barSum)).toBe(total);
    expect(await page.getByTestId("cefr-histogram").getAttribute("data-histogram-total")).toBe(
      total,
    );

    // Label + số — bucket labels hiển thị text (a11y không phụ thuộc màu)
    for (const label of ["A1", "A2", "B1", "B2", "C1", "C2", "Chưa gắn", "Khác"]) {
      await expect(
        page.getByTestId("cefr-histogram").getByText(label, { exact: true }),
      ).toBeVisible();
    }
  });

  test("t4: bảng per-book sort theo số words desc; t5: panel crawl + link dashboard", async ({
    page,
  }) => {
    await gotoStats(page);

    // Bảng per-book: ≥1 book (DB template có sách) — cột words GIẢM DẦN
    const table = page.getByTestId("per-book-table");
    await expect(table).toBeVisible();
    const rows = await table.getByRole("row").all();
    const numbers: number[] = [];
    for (const row of rows) {
      // header row dùng th (role columnheader) — chỉ đếm dòng tbody (td)
      if ((await row.getByRole("cell").count()) === 0) continue;
      numbers.push(Number(await row.getByRole("cell").nth(1).textContent()));
    }
    expect(numbers.length).toBeGreaterThan(0);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i], `row ${i}: ${numbers[i - 1]} ≥ ${numbers[i]}`).toBeLessThanOrEqual(
        numbers[i - 1]!,
      );
    }

    // Panel crawl reuse crawlStatsDb: 3 số + link sang crawl dashboard VU-32
    await expect(page.getByTestId("crawl-parsed")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("crawl-pending")).toHaveText(/^\d+$/);
    await expect(page.getByTestId("crawl-failed")).toHaveText(/^\d+$/);
    const link = page.getByRole("link", { name: "Mở Crawl Oxford" });
    await expect(link).toHaveAttribute("href", "/admin/vocabulary/crawl");
    await link.click();
    await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary/crawl");
    await expect(
      page.getByRole("heading", { name: "Crawl Oxford" }),
    ).toBeVisible({ timeout: 90_000 });
  });

  test("t1: sub-nav Stats hết 404 từ CẢ Catalog và Curation (phase-1 dead-link gỡ)", async ({
    page,
  }) => {
    await openStatsViaSubNav(page, "/admin/vocabulary");
    await openStatsViaSubNav(page, "/admin/vocabulary/curation");
  });
});

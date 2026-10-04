import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";

/**
 * E2E dashboard crawl (VU-32 SF-3, context pack §7 suite 1) — stats hiển thị
 * khớp DB (pattern admin-dashboard.spec: expected lấy từ SQL tại thời điểm
 * chạy, không hardcode count shared DB), failed sample, hint runner + attribution.
 *
 * retry-failed đi REAL API (DB-only, không network ngoài); refresh-sitemap
 * MOCK ở tầng browser (page.route fulfill) — API thật sẽ fetch sitemap Oxford
 * server-side mà Playwright route KHÔNG intercept được (dev server process
 * riêng) + boundary cấm gọi Oxford thật trong e2e.
 */
dotenv.config({ path: ".env.local" });

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

async function qaBookSlug(): Promise<string> {
  const c = db();
  const rows = await c<{ slug: string }[]>`
    select slug from books where slug like 'qa-sf3-%' limit 2`;
  await c.end();
  expect(rows, "đúng 1 fixture book QA (setup sweep trước seed)").toHaveLength(1);
  return rows[0]!.slug;
}

async function crawlCounts(): Promise<{
  pending: number;
  parsed: number;
  failed: number;
  failedMaxAttempts: number;
}> {
  const c = db();
  const rows = await c<{ status: string; n: number; maxed: number }[]>`
    select status, count(*)::int as n,
           count(*) filter (where attempts >= 5)::int as maxed
    from crawl_entries group by status`;
  await c.end();
  const pick = (s: string) => rows.find((r) => r.status === s);
  return {
    pending: pick("pending")?.n ?? 0,
    parsed: pick("parsed")?.n ?? 0,
    failed: pick("failed")?.n ?? 0,
    failedMaxAttempts: pick("failed")?.maxed ?? 0,
  };
}

/** login admin (creds env — globalSetup đã upsert) → vào dashboard crawl. */
async function loginCrawl(
  page: import("@playwright/test").Page,
): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/vocabulary/crawl");
  await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary/crawl");
  await expect(page.getByRole("heading", { name: "Crawl Oxford" })).toBeVisible();
}

test.describe("Crawl dashboard (SF-3)", () => {
  test("stats khớp DB + failed sample + hint runner + attribution", async ({
    page,
  }) => {
    const counts = await crawlCounts();
    expect(await qaBookSlug()).toBeTruthy();

    await loginCrawl(page);

    await expect(page.locator('[data-count="pending"]')).toHaveText(
      String(counts.pending),
    );
    await expect(page.locator('[data-count="parsed"]')).toHaveText(
      String(counts.parsed),
    );
    await expect(page.locator('[data-count="failed"]')).toHaveText(
      String(counts.failed),
    );
    await expect(page.locator('[data-count="failedMaxAttempts"]')).toHaveText(
      String(counts.failedMaxAttempts),
    );

    // failed sample seeded bởi fixture — slug + last_error hiển thị raw
    const sample = page
      .locator("li")
      .filter({ hasText: "qasf3-crash-me" });
    await expect(sample).toHaveCount(1);
    await expect(sample).toContainText("HTTP 500 — QA mock failure");

    // hint lệnh runner copy-able — P1 review A: keys ở controls.*
    await expect(
      page.getByText("node scripts/oxford-crawl.ts fetch --apply"),
    ).toBeVisible();
    await expect(
      page.getByText("Nguồn: Oxford Learner's Dictionaries"),
    ).toBeVisible();
  });

  test("retry-failed REAL: failed → pending, counts cập nhật sau refetch", async ({
    page,
  }) => {
    const before = await crawlCounts();
    // retry reset failed attempts<5; failed attempts>=5 ở lại failed
    const resettable = before.failed - before.failedMaxAttempts;

    await loginCrawl(page);

    await page.getByRole("button", { name: "Retry entry lỗi" }).click();
    // toast sau response — route control compile lạnh lần đầu (60-115s), toast
    // chỉ tươi 4s → poll window phải dài (compile xong toast hiện là bắt được)
    await expect(
      page.getByText(`Đã reset ${resettable} entry lỗi về hàng chờ.`),
    ).toBeVisible({ timeout: 150_000 });

    // stats refetch sau control — failed giảm đúng resettable, pending tăng
    await expect(page.locator('[data-count="failed"]')).toHaveText(
      String(before.failed - resettable),
    );
    await expect(page.locator('[data-count="pending"]')).toHaveText(
      String(before.pending + resettable),
    );
  });

  test("refresh-sitemap mock browser-route: request body + toast inserted", async ({
    page,
  }) => {
    let capturedAction: unknown = null;
    await page.route("**/api/admin/vocabulary/crawl/control", async (route) => {
      const body = route.request().postDataJSON() as { action?: string };
      capturedAction = body.action;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, inserted: 42 }),
      });
    });

    await loginCrawl(page);

    await page.getByRole("button", { name: "Refresh sitemap" }).click();
    await expect(
      page.getByText("Đã thêm 42 slug mới từ sitemap."),
    ).toBeVisible();
    expect(capturedAction).toBe("refresh-sitemap");

    await page.unroute("**/api/admin/vocabulary/crawl/control");
  });
});

import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";

/**
 * Convergence trên merged base (VU-43 SF-4 t8 — spec §6.3/§6.7): 2 assertion
 * chéo SF bị DEFER từ sf-2/sf-3 (worktree fork chưa có surface nhau) nhận Ở
 * ĐÂY — "nhà" của chúng trên merged base:
 * - §6.3: từ PROMOTED (crawl_entries → promote) XUẤT HIỆN trong catalog UI
 *   /admin/vocabulary (SF-3 seed + SF-2 surface — chỉ hợp khi cả 2 merged).
 * - §6.7: nav "Từ vựng" active trên /admin/vocabulary/curation (sf-2 nav rule
 *   + sf-3 page — chỉ hợp khi cả 2 merged).
 *
 * Fixture `qa-cms-<tok>-*` unique-per-run (convention §8) + self-clean qua
 * cleanup helper dùng chung SF-1 + book slug riêng. Promote qua API
 * (page.request — cookie admin) — flow UI promote đã pin ở SF-3 spec.
 */
dotenv.config({ path: ".env.local" });

test.describe.configure({ mode: "serial" });

test.setTimeout(180_000);

const TOK = Date.now().toString(36);
const PROMOTED_WORD = `qa-cms-${TOK}-conv`;
const ENTRY_SLUG = `qa-cms-${TOK}-conv`;
const BOOK_SLUG = `qa-cms-book-${TOK}`;
const BOOK_LABEL = `QA CMS Conv Book ${TOK}`;
const MEANING = `nghĩa convergence ${TOK}`;

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

/** INSERT crawl_entries parsed (mirror seedCrawlEntry — oxford-crawl-fixture). */
async function seedCrawlEntry(c: postgres.Sql): Promise<void> {
  const raw = {
    headword: PROMOTED_WORD,
    senses: [{ def: null, examples: [] }],
    idioms: [],
    phrasalVerbs: [],
  };
  await c`
    INSERT INTO crawl_entries (slug, word, cefr, pos, ox3000, raw, status)
    VALUES (${ENTRY_SLUG}, ${PROMOTED_WORD}, 'A2', 'noun', false, ${c.json(raw)}, 'parsed')
    ON CONFLICT (slug) DO UPDATE SET word = EXCLUDED.word, status = 'parsed'`;
}

let bookId = 0;

test.beforeAll(async () => {
  const c = db();
  await c`DELETE FROM books WHERE slug = ${BOOK_SLUG}`; // cascade book_words
  execSync("node e2e/helpers/cleanup-vocab-cms.ts --apply", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const [bk] = await c<{ id: number }[]>`
    INSERT INTO books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    VALUES ((SELECT coalesce(max(id), 900000) + 1 FROM books WHERE id >= 900000),
            ${BOOK_SLUG}, ${BOOK_LABEL}, ${BOOK_LABEL}, 'A1', '#3366cc', 9002)
    RETURNING id`;
  bookId = bk!.id;
  await seedCrawlEntry(c);
  await c.end();
});

test.afterAll(async () => {
  const c = db();
  await c`DELETE FROM books WHERE slug = ${BOOK_SLUG}`;
  await c.end();
  execSync("node e2e/helpers/cleanup-vocab-cms.ts --apply", {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const v = db();
  const [left] = await v<{ words: number; entries: number }[]>`
    SELECT (SELECT count(*) FROM words WHERE word LIKE 'qa-cms-%')::int AS words,
           (SELECT count(*) FROM crawl_entries WHERE slug LIKE 'qa-cms-%')::int AS entries`;
  await v.end();
  expect(left!.words).toBe(0);
  expect(left!.entries).toBe(0);
});

test.describe("Convergence merged base (SF-4 t8)", () => {
  test("§6.7: nav 'Từ vựng' active trên /curation (không double với Crawl) + sub-nav Curation active", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/vocabulary/curation", { timeout: 120_000 });
    await expect(
      page.getByRole("heading", { name: "Curation queue Oxford" }),
    ).toBeVisible({ timeout: 90_000 }); // compile lạnh lần đầu

    // Nav chính: "Từ vựng" active — "Crawl Oxford" KHÔNG (tranh prefix)
    await expect(
      page.getByRole("link", { name: "Từ vựng", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("link", { name: "Crawl Oxford", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");

    // Sub-nav trong trang: Curation active
    const subnav = page.getByRole("navigation", { name: "Vocabulary CMS" });
    await expect(
      subnav.getByRole("link", { name: "Curation", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      subnav.getByRole("link", { name: "Catalog", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
  });

  test("§6.3: từ promoted XUẤT HIỆN trong catalog UI /admin/vocabulary (assertion deferred sf-2∥sf-3)", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Promote qua API (cookie admin của page.request) — SF-3 đã pin flow UI
    const eid = await entryId();
    expect(eid, "crawl_entries fixture phải có mặt sau beforeAll").not.toBeNull();
    const res = await page.request.post("/api/admin/vocabulary/crawl/promote", {
      data: { entryIds: [eid!], bookId, meanings: { [String(eid!)]: MEANING } },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      report: { created: number; duplicates: number; failed: unknown[] };
    };
    expect(body.ok).toBe(true);
    expect(body.report.created).toBe(1);
    expect(body.report.duplicates).toBe(0);
    expect(body.report.failed).toEqual([]);

    // ASSERTION DEFERRED (nhà SF-4): từ promoted THẤY trong catalog UI
    await page.goto("/admin/vocabulary", { timeout: 120_000 });
    // search chỉ fill — debounce 300ms + refetch tự chạy (pattern SF-2 spec)
    await page
      .getByRole("textbox", { name: "Tìm theo từ hoặc nghĩa" })
      .fill(PROMOTED_WORD);
    const row = page.getByRole("row", { name: new RegExp(PROMOTED_WORD) }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText(MEANING)).toBeVisible();
    await expect(row.getByText("A2", { exact: true })).toBeVisible();
    await expect(row.getByText("Oxford", { exact: true })).toBeVisible();

    // Regression chéo: sub-nav từ catalog sang Stats vẫn render (t1 dead-link)
    const subnav = page.getByRole("navigation", { name: "Vocabulary CMS" });
    await subnav.getByRole("link", { name: "Thống kê" }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary/stats");
  });
});

/** crawl_entries.id của fixture (promote API cần id — seed trước đó). */
async function entryId(): Promise<number | null> {
  const c = db();
  const [row] = await c<{ id: number }[]>`
    SELECT id FROM crawl_entries WHERE slug = ${ENTRY_SLUG} LIMIT 1`;
  await c.end();
  return row?.id ?? null;
}

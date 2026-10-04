import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";
import { parseEntry } from "../src/lib/oxford/parse";

/**
 * E2E crawl-on-add dialog (VU-32 SF-3, context pack §7 suite 3) —
 * - cache-hit: REAL API (seed crawl_entries) — preview tức thì `từ kho crawl`,
 *   IPA/pos/audio hiện → meaning VI bắt buộc → approve → word vào book.
 * - miss: fulfill response /crawl/word ở tầng BROWSER — entry derive từ
 *   fixture HTML SF-1 (entry-basic.html) qua parseEntry (KHÔNG author file
 *   trùng). Lý do không mock tầng Oxford: fetch server-side của dev server
 *   KHÔNG thể intercept bằng Playwright route; boundary cấm gọi Oxford thật.
 *   Approve vẫn REAL: entry live không có blob + không có crawl row → word
 *   tạo KHÔNG audio (không hotlink — đúng spec P0-3).
 */
dotenv.config({ path: ".env.local" });

test.describe.configure({ mode: "serial" });

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

async function qaBookId(): Promise<number> {
  const c = db();
  const rows = await c<{ id: number }[]>`
    select id from books where slug like 'qa-sf3-%' limit 2`;
  await c.end();
  expect(rows, "đúng 1 fixture book QA").toHaveLength(1);
  return rows[0]!.id;
}

async function openAddDialog(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.getByRole("button", { name: "Thêm từ từ Oxford" }).click();
  await expect(page.getByRole("heading", { name: "Thêm từ từ Oxford" })).toBeVisible();
}

async function lookupWord(
  page: import("@playwright/test").Page,
  word: string,
): Promise<void> {
  await page.locator("#crawl-add-word").fill(word);
  await page.getByRole("button", { name: "Tra Oxford" }).click();
}

async function approveWithMeaning(
  page: import("@playwright/test").Page,
  meaning: string,
): Promise<void> {
  await page.locator("#crawl-add-meaning").fill(meaning);
  await page.getByRole("button", { name: "Duyệt thêm vào sách" }).click();
}

test.describe("Crawl-on-add (SF-3)", () => {
  test("cache-hit: preview tức thì → approve tạo mới + audio blob", async ({
    page,
  }) => {
    const bookId = await qaBookId();
    await loginAsAdmin(page);
    const slugRow = await db()`select slug from books where id = ${bookId}`;
    const bookSlug = slugRow[0]!.slug;
    await page.goto(`/admin/books/${bookSlug}/vocabulary`);
    await expect(page).toHaveURL((u) => u.pathname === `/admin/books/${bookSlug}/vocabulary`);

    await openAddDialog(page);
    await lookupWord(page, "qasf3-cache-add");

    // cache-hit — badge nguồn crawl + IPA + pos + audio indicator
    // (route /crawl/word compile lạnh lần đầu → poll dài)
    await expect(page.getByText("từ kho crawl")).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("qasf3-cache-add").first()).toBeVisible();
    await expect(page.getByText("/kæʃ/")).toBeVisible();
    await expect(page.getByText("Có audio phát âm")).toBeVisible();

    // meaning VI bắt buộc — nút duyệt disabled khi rỗng (teacher-owned, không LLM)
    await expect(
      page.getByRole("button", { name: "Duyệt thêm vào sách" }),
    ).toBeDisabled();
    await approveWithMeaning(page, "QA bộ nhớ đệm");

    // tạo mới 201 → toast created + audioAttached; dialog đóng; refetch bảng
    // (route approve compile lạnh lần đầu → poll dài)
    await expect(
      page.getByText("Đã thêm từ “qasf3-cache-add” vào sách."),
    ).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("kèm audio phát âm")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Thêm từ từ Oxford" }),
    ).toBeHidden();

    const tableRow = page
      .locator("table tbody tr")
      .filter({ hasText: "qasf3-cache-add" });
    await expect(tableRow).toHaveCount(1);

    const c = db();
    const rows = await c<{
      meaningVi: string;
      ipa: string | null;
      cefr: string | null;
      source: string | null;
      audioUrl: string | null;
      linked: number;
    }[]>`
      select w.meaning_vi as "meaningVi", w.ipa, w.cefr, w.source,
             w.audio_url as "audioUrl",
             (select count(*)::int from book_words bw
              where bw.word_id = w.id and bw.book_id = ${bookId}) as linked
      from words w where w.word = 'qasf3-cache-add'`;
    const row = rows[0]!;
    await c.end();
    expect(row).toMatchObject({
      meaningVi: "QA bộ nhớ đệm",
      ipa: "/kæʃ/",
      cefr: "B1",
      source: "oxford-ld",
      audioUrl: "https://blob.vercel-storage.com/audio/oxford/qasf3-cache-add.uk-fake.mp3",
      linked: 1,
    });
  });

  test("duplicate: word có sẵn → note gắn thêm, không tạo row mới", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const slugRow = await db()`select slug from books where slug like 'qa-sf3-%'`;
    const bookSlug = slugRow[0]!.slug;
    await page.goto(`/admin/books/${bookSlug}/vocabulary`);

    await openAddDialog(page);
    await lookupWord(page, "qasf3-tree");
    await expect(page.getByText("từ kho crawl")).toBeVisible({ timeout: 30_000 });
    await approveWithMeaning(page, "QA cây duplicate");

    await expect(
      page.getByText("Từ đã có — đã gắn thêm vào sách này."),
    ).toBeVisible();

    const c = db();
    const [row] = await c<{ n: number; meaningVi: string }[]>`
      select count(*)::int as n, min(meaning_vi) as "meaningVi"
      from words where word = 'qasf3-tree'`;
    await c.end();
    expect(row?.n).toBe(1); // không tạo dup
    expect(row?.meaningVi).toBe("QA cây"); // reuse giữ meaning gốc (seed)
  });

  test("miss (mock live từ fixture SF-1): preview → approve word KHÔNG audio", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const slugRow = await db()`select slug from books where slug like 'qa-sf3-%'`;
    const bookSlug = slugRow[0]!.slug;
    await page.goto(`/admin/books/${bookSlug}/vocabulary`);

    // Fulfill shape `from:'live'` — entry derive từ fixture HTML SF-1 qua
    // parseEntry (color: /ˈkʌlə(r)/ noun A1). Blob null như live thật.
    const html = readFileSync(
      path.resolve(process.cwd(), "src/lib/oxford/fixtures/entry-basic.html"),
      "utf8",
    );
    const parsed = parseEntry(html);
    expect(parsed).not.toBeNull();
    await page.route("**/api/admin/vocabulary/crawl/word", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          found: true,
          from: "live",
          entry: {
            slug: "qasf3-color",
            // word giữ prefix QA để teardown sweep — IPA/pos/cefr thật từ fixture
            word: "qasf3-color",
            ipaUk: parsed!.ipaUk,
            ipaUs: parsed!.ipaUs,
            cefr: parsed!.cefr,
            pos: parsed!.pos,
            audioUkBlob: null,
            audioUsBlob: null,
          },
        }),
      });
    });

    await openAddDialog(page);
    await lookupWord(page, "qasf3-color");
    await expect(page.getByText("tải trực tiếp")).toBeVisible();
    await expect(page.getByText("/ˈkʌlə(r)/")).toBeVisible();
    await expect(page.getByText("noun")).toBeVisible();
    await expect(page.getByText("Chưa có audio — enrich sau bổ sung")).toBeVisible();

    await approveWithMeaning(page, "QA màu sắc");
    await expect(
      page.getByText("Đã thêm từ “qasf3-color” vào sách."),
    ).toBeVisible();
    await expect(
      page.getByText("chưa có audio (tải thất bại — enrich sau bổ sung)"),
    ).toBeVisible();

    // approve REAL: không crawl row 'qasf3-color' → không audio (không hotlink,
    // không gọi Oxford — resolveApproveAudio dừng ở DB lookup miss)
    const c = db();
    const [row] = await c<{ audioUrl: string | null; source: string | null; cefr: string | null }[]>`
      select audio_url as "audioUrl", source, cefr
      from words where word = 'qasf3-color'`;
    await c.end();
    expect(row?.audioUrl).toBeNull();
    expect(row?.source).toBe("oxford-ld");
    expect(row?.cefr).toBe("A1");

    await page.unroute("**/api/admin/vocabulary/crawl/word");
  });
});

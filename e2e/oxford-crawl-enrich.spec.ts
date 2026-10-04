import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";

/**
 * E2E enrich panel per book (VU-32 SF-3, context pack §7 suites 2+4) —
 * dryRun preview counts → apply → report per-word + fill-empty CONTRACT
 * (field teacher đã nhập KHÔNG bị đụng — qa-sf3-book giữ IPA preset) + badge
 * CEFR/source sau refetch. Book 201 từ → loop batch 2 chunks (200+1) không
 * treo — report gộp đủ 201 dòng summary.
 *
 * Đi REAL API 2 đầu (dryRun + apply) — chỉ đọc crawl_entries seed fixture,
 * KHÔNG gọi Oxford (enrich thuần DB).
 */
dotenv.config({ path: ".env.local" });

test.describe.configure({ mode: "serial" });

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

async function qaBookSlug(): Promise<string> {
  const c = db();
  const rows = await c<{ slug: string }[]>`
    select slug from books where slug like 'qa-sf3-%' limit 2`;
  await c.end();
  expect(rows, "đúng 1 fixture book QA").toHaveLength(1);
  return rows[0]!.slug;
}

test.describe("Enrich panel (SF-3)", () => {
  test("preview counts → apply → report + fill-empty contract + badge", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000); // 2 route compile lạnh + 4 POST chunk Neon
    const slug = await qaBookSlug();

    // De-contaminate: specs chạy alphabet (add → dashboard → enrich trong 1
    // suite) — add.spec approve-duplicate đã COALESCE cefr/source vào
    // qasf3-tree (fill-empty path của createVocabularyWord) + tạo qasf3-
    // cache-add/qasf3-color gia nhập QA book → enrich counts lệch. Khôi phục
    // pristine CHÍNH XÁC fixture ban đầu (202→201 từ) trước khi mở panel.
    const c0 = db();
    await c0`delete from words where word in ('qasf3-cache-add', 'qasf3-color')`;
    await c0`update words set ipa = null, cefr = null, source = null, audio_url = null, example = null
            where word like 'qasf3-%' and word != 'qasf3-book'`;
    await c0`update words set ipa = '/bʊk-preset/', cefr = null, source = null, audio_url = null, example = null
            where word = 'qasf3-book'`;
    const [wc] = await c0<{ n: number }[]>`
      select count(*)::int as n from book_words bw
      join books b on b.id = bw.book_id where b.slug = ${slug}`;
    expect(wc?.n).toBe(201);
    await c0.end();

    await loginAsAdmin(page);
    await page.goto(`/admin/books/${slug}/vocabulary`);
    await expect(page).toHaveURL((u) =>
      u.pathname === `/admin/books/${slug}/vocabulary`,
    );

    // mở panel → scanning → preview counts (fixture: tree+book match crawl)
    await page.getByRole("button", { name: "Điền dữ liệu thiếu từ Oxford" }).click();
    await expect(page.getByText("Xem trước (chưa ghi dữ liệu)")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator('[data-count="candidates"]')).toHaveText("2");
    await expect(page.locator('[data-count="fillableIpa"]')).toHaveText("1");
    await expect(page.locator('[data-count="fillableExample"]')).toHaveText("1");
    await expect(page.locator('[data-count="fillableCefr"]')).toHaveText("2");
    await expect(page.locator('[data-count="fillableAudio"]')).toHaveText("1");

    // confirm apply — 201 từ → 2 chunks (200+1) continue-and-collect
    await page.getByRole("button", { name: "Chạy điền (201 từ)" }).click();
    await expect(
      page.getByText("2 từ được điền · 199 bỏ qua · 201 từ."),
    ).toBeVisible({ timeout: 180_000 });

    // report per-word: tree fill 4 field; book skipped IPA + reason noAudioBlob
    const treeRow = page.locator("li").filter({ hasText: "qasf3-tree" }).first();
    await expect(treeRow).toContainText("IPA");
    await expect(treeRow).toContainText("Audio");
    const bookRow = page.locator("li").filter({ hasText: "qasf3-book" }).first();
    await expect(bookRow).toContainText("IPA · có sẵn");
    await expect(bookRow).toContainText(
      "entry không có audio blob — chạy phase audio của runner",
    );

    // CONTRACT fill-empty — DB truth:
    // - tree: trống hoàn toàn → đủ 4 field + source
    // - book: IPA teacher PRESET → GIỮ NGUYÊN; example/cefr được điền
    const c = db();
    const [tree] = await c<{ ipa: string | null; example: string | null; cefr: string | null; audioUrl: string | null; source: string | null }[]>`
      select ipa, example, cefr, audio_url as "audioUrl", source
      from words where word = 'qasf3-tree'`;
    expect(tree).toEqual({
      ipa: "/triː/",
      example: "I climbed a qasf3-tree.",
      cefr: "A1",
      audioUrl: "https://blob.vercel-storage.com/audio/oxford/qasf3-tree.uk-fake.mp3",
      source: "oxford-ld",
    });
    const [book] = await c<{ ipa: string | null; example: string | null; cefr: string | null; audioUrl: string | null; source: string | null }[]>`
      select ipa, example, cefr, audio_url as "audioUrl", source
      from words where word = 'qasf3-book'`;
    expect(book?.ipa).toBe("/bʊk-preset/"); // teacher value KHÔNG bị đụng
    expect(book?.example).toBeNull(); // entry book không có example → không fill
    expect(book?.cefr).toBe("A2"); // duy nhất cefr được fill
    expect(book?.audioUrl).toBeNull();
    expect(book?.source).toBe("oxford-ld"); // ≥1 fill → source set
    await c.end();

    // badge CEFR + marker nguồn sau onDone refetch
    const tableRow = page.locator("table tbody tr").filter({ hasText: "qasf3-tree" });
    await expect(tableRow).toHaveCount(1);
    await expect(tableRow).toContainText("A1");
    await expect(tableRow).toContainText("Oxford");
  });
});

import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";

/**
 * Catalog toàn cục /admin/vocabulary (VU-43 SF-2 t2-t12 — spec §6.1–6.2).
 * Shared-DB convention (spec §8): fixture prefix `qa-cms-`, workers 1, cleanup
 * helper SF-1 (`cleanup-vocab-cms.ts --apply`) trong teardown + books fixture
 * xoá SQL trực tiếp (helper chỉ dọn words/crawl_entries).
 * Assert public book page = surface có trong base (/vi/books/[book]/vocabulary).
 */

dotenv.config({ path: ".env.local" });

test.describe.configure({ mode: "serial" });

// Cold-compile route admin lần đầu có thể >30s (bài học SF-6) — nới timeout
test.setTimeout(150_000);

const BOOK_A_SLUG = "qa-cms-book-a";
const BOOK_B_SLUG = "qa-cms-book-b";
const BOOK_A_ID = 990001;
const BOOK_B_ID = 990002;

let sql: postgres.Sql;

function db(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", {
    prepare: false,
    max: 1,
  });
  return sql;
}

async function seedFixtures(): Promise<void> {
  const c = db();
  // Idempotent re-run: xoá sạch fixture cũ (book cascade book_words; words
  // cascade progress/activity)
  await c`delete from words where word like 'qa-cms-%'`;
  await c`delete from books where id in (${BOOK_A_ID}, ${BOOK_B_ID}) or slug like 'qa-cms-book-%'`;

  // Books fixture — books.id KHÔNG auto-increment (schema: 1–7 seed) → id cao
  await c`
    insert into books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    values
      (${BOOK_A_ID}, ${BOOK_A_SLUG}, 'QA Catalog Book A', 'QA Sách A', 'B1', '#2563eb', 9001),
      (${BOOK_B_ID}, ${BOOK_B_SLUG}, 'QA Catalog Book B', 'QA Sách B', 'B2', '#16a34a', 9002)`;

  // 55 từ pagination — meaning KHÔNG chứa 'qa-cms-page' (search chỉ khớp word);
  // insert TRƯỚC 4 từ chính → sort created desc: từ chính (mới nhất) top trang 1
  const pageWords = Array.from(
    { length: 55 },
    (_, i) => `qa-cms-page-${String(i + 1).padStart(2, "0")}`,
  );
  await c`insert into words (word, meaning_vi) values ${c(
    pageWords.map((word) => [word, "từ trang học tầng"]),
  )}`;

  // Words fixture chính — phủ đủ tổ hợp filter (cefr/source/audio/book/orphan);
  // beta/gamma assert qua UI — chỉ alpha + delta cần id (book_words links)
  const [alpha, , , delta] = await c`
    insert into words (word, ipa, meaning_vi, example, audio_url, cefr, source, pos, synonyms)
    values
      ('qa-cms-alpha', 'ˈæp.əl', 'quả táo qa-cms', 'I eat an apple.', null, 'B1', null, null, null),
      ('qa-cms-beta', null, 'con gà qa-cms', null, null, null, null, null, null),
      ('qa-cms-gamma', 'dʒʌmp', 'nhảy qa-cms', null, 'https://cdn.ilec.test/qa-cms-gamma.mp3', 'B2', 'oxford-ld', 'verb', null),
      ('qa-cms-delta', null, 'con chó qa-cms', null, null, 'A1', null, null, null)
    returning id, word`;

  // Gắn sách: alpha + delta → book A (delta để assert public page sau delete)
  await c`
    insert into book_words (book_id, word_id, "order")
    values (${BOOK_A_ID}, ${alpha.id}, 99001), (${BOOK_A_ID}, ${delta.id}, 99002)`;

  // Progress SRS cho delta (delete dry-run assert progressAffected ≥ 1)
  const [admin] = await c<{ id: string }[]>`
    select u.id from users u join profiles p on p.id = u.id
    where u.email = 'admin@ilec.dev' limit 1`;
  expect(admin, "admin fixture user (globalSetup upsert)").toBeTruthy();
  await c`
    insert into user_word_progress (user_id, word_id)
    values (${admin!.id}, ${delta.id})`;
}

test.beforeAll(async ({ request }) => {
  await seedFixtures();
  // Warm cold-compile các route API lần đầu hit (bài học SF-6: compile lạnh
  // 60-115s → toast-assert 15s fail hụt dù request đang chạy). Path no-op an
  // toàn trên shared-DB: token giả → 401 nhưng ROUTE đã compile.
  const { forgeSessionToken } = await import("./admin-lib");
  const warmToken = await forgeSessionToken({
    sub: "00000000-0000-0000-0000-000000000000",
    role: "admin",
    email: "qa-cms-warm@test.ilec",
  });
  const headers = { cookie: `authjs.session-token=${warmToken}` };
  await request.post("/api/admin/vocabulary/bulk", {
    headers,
    data: { action: "delete", wordIds: [], dryRun: true },
  });
  await request.get("/api/admin/vocabulary/export?q=qa-cms-warm-nohit", {
    headers,
  });
  await request.post("/api/admin/vocabulary/image", {
    headers,
    multipart: {
      file: {
        name: "warm.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("warm"),
      },
    },
  });
});

test.afterAll(async () => {
  // Cleanup helper SF-1 dùng chung (words qa-cms-% cascade progress/links)
  try {
    execSync("node e2e/helpers/cleanup-vocab-cms.ts --apply", {
      stdio: "inherit",
      timeout: 60_000,
    });
  } finally {
    await db()`delete from books where slug like 'qa-cms-book-%'`;
    await sql?.end();
  }
});

// ---------------------------------------------------------------------------
// Helpers UI
// ---------------------------------------------------------------------------

async function gotoCatalog(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/vocabulary", { timeout: 120_000 });
  await expect(page).toHaveURL((u) => u.pathname === "/admin/vocabulary");
  // chờ fetch client xong — pagination status render khi data về (default sort
  // created desc: fixture page-words mới nhất nằm trang 1)
  await expect(page.getByText(/^Trang 1\//)).toBeVisible({ timeout: 30_000 });
}

/** Search + chờ debounce 300ms + refetch (row khớp/hết khớp xuất hiện). */
async function search(page: Page, q: string): Promise<void> {
  await page.getByRole("textbox", { name: "Tìm theo từ hoặc nghĩa" }).fill(q);
}

function row(page: Page, word: string) {
  return page.getByRole("row", { name: new RegExp(word) }).first();
}

async function selectOption(page: Page, triggerId: string, label: string) {
  await page.getByRole("combobox").and(page.locator(`#${triggerId}`)).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/**
 * Checkbox setChecked chống mid-RSC-swap (bài học e2e: click race lúc bảng
 * re-render sau refetch) — click timeout NGẮN + retry tới khi đúng state.
 */
async function setChecked(
  locator: ReturnType<Page["getByRole"]>,
  checked: boolean,
): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await locator.isChecked().catch(() => false)) === checked) return;
    try {
      await locator.click({ timeout: 2500 });
    } catch {
      // click race — thử lại
    }
    await locator.page().waitForTimeout(400);
  }
  const final = await locator.isChecked().catch(() => false);
  if (final !== checked) {
    throw new Error(`setChecked(${checked}): checkbox không đạt state sau retry`);
  }
}

async function openEditDialog(page: Page, word: string): Promise<void> {
  await page
    .getByRole("button", { name: `Sửa ${word}` })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: `Sửa từ “${word}”` }),
  ).toBeVisible();
}

// 1×1 PNG (pixel trong suốt) — upload preview thumb
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// ---------------------------------------------------------------------------
// §6.1 — filter/search/edit/image + §6.2 — bulk
// ---------------------------------------------------------------------------

test.describe("Catalog /admin/vocabulary (SF-2)", () => {
  test("t1: bảng render + search theo NGHĨA tiếng Việt có dấu (§6.1)", async ({
    page,
  }) => {
    await gotoCatalog(page);

    // H1 + count + bảng có fixture (sort created desc — seed trong top trang 1)
    await expect(
      page.getByRole("heading", { name: "Từ vựng", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Trang 1/")).toBeVisible();

    // Search theo NGHĨA (có dấu) — 'táo' chỉ khớp alpha
    await search(page, "táo");
    await expect(row(page, "qa-cms-alpha")).toBeVisible();
    await expect(row(page, "qa-cms-beta")).toBeHidden();
    await expect(row(page, "qa-cms-gamma")).toBeHidden();

    // Empty state khi 0 kết quả (không bảng trống xấu)
    await search(page, "qa-cms-khongtontai-xyz");
    await expect(
      page.getByText("Không có từ nào khớp — đổi bộ lọc hoặc thêm từ mới."),
    ).toBeVisible();
  });

  test("t2: filter CEFR/audio/orphan + sort cefr (null CUỐI) (§6.1)", async ({
    page,
  }) => {
    await gotoCatalog(page);

    // Search tất cả fixture chính — sort cefr asc: A1 delta, B1 alpha,
    // B2 gamma, null CUỐI (beta + page-words). nth(0) = header row.
    await search(page, "qa-cms-");
    await selectOption(page, "catalog-sort", "Theo CEFR");
    await expect(row(page, "qa-cms-alpha")).toBeVisible();
    const rows = page.getByRole("row");
    await expect(rows.nth(1)).toContainText("qa-cms-delta");
    await expect(rows.nth(2)).toContainText("qa-cms-alpha");
    await expect(rows.nth(3)).toContainText("qa-cms-gamma");
    await expect(rows.nth(4)).toContainText("qa-cms-beta"); // null cefr → cuối

    // Reset — chip CEFR B1: alpha giữ, gamma (B2) biến mất
    await page.getByRole("button", { name: "Xoá lọc" }).click();
    await page.getByRole("button", { name: "B1", exact: true }).click();
    await expect(row(page, "qa-cms-alpha")).toBeVisible();
    await expect(row(page, "qa-cms-gamma")).toBeHidden();

    // audio=thiếu: alpha (null) giữ, gamma (có audio) biến mất
    await page.getByRole("button", { name: "B1", exact: true }).click(); // bỏ B1
    await selectOption(page, "catalog-audio", "Thiếu audio");
    await expect(row(page, "qa-cms-alpha")).toBeVisible();
    await expect(row(page, "qa-cms-gamma")).toBeHidden();

    // audio=có: chỉ gamma
    await selectOption(page, "catalog-audio", "Có audio");
    await expect(row(page, "qa-cms-gamma")).toBeVisible();
    await expect(row(page, "qa-cms-alpha")).toBeHidden();

    // audio=all + orphan: beta (không gắn sách) xuất hiện, alpha (book A) mất
    await selectOption(page, "catalog-audio", "Tất cả");
    await setChecked(page.getByRole("checkbox", { name: "Chưa gắn sách" }), true);
    await expect(row(page, "qa-cms-beta")).toBeVisible();
    await expect(row(page, "qa-cms-alpha")).toBeHidden();

    // bỏ orphan — source=oxford: gamma (filter độc lập, AND khi cùng chọn)
    await setChecked(page.getByRole("checkbox", { name: "Chưa gắn sách" }), false);
    await selectOption(page, "catalog-source", "Oxford");
    await expect(row(page, "qa-cms-gamma")).toBeVisible();
    await expect(row(page, "qa-cms-beta")).toBeHidden();

    // source=teacher (source IS NULL): alpha
    await selectOption(page, "catalog-source", "Teacher");
    await expect(row(page, "qa-cms-alpha")).toBeVisible();
    await expect(row(page, "qa-cms-gamma")).toBeHidden();
  });

  test("t3: pagination 50/page — 55 fixture qua trang 2 (§6.1)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "qa-cms-page");
    await selectOption(page, "catalog-sort", "Theo từ (A→Z)");

    await expect(page.getByText("55 từ khớp")).toBeVisible();
    await expect(page.getByText("Trang 1/2")).toBeVisible();
    await expect(row(page, "qa-cms-page-01")).toBeVisible();
    await expect(row(page, "qa-cms-page-50")).toBeVisible();
    await expect(row(page, "qa-cms-page-51")).toBeHidden();

    await page.getByRole("button", { name: "Trang sau" }).click();
    await expect(page.getByText("Trang 2/2")).toBeVisible();
    await expect(row(page, "qa-cms-page-51")).toBeVisible();
    await expect(row(page, "qa-cms-page-55")).toBeVisible();
    await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();

    await page.getByRole("button", { name: "Trang trước" }).click();
    await expect(page.getByText("Trang 1/2")).toBeVisible();
  });

  test("t4: sửa từ — pos/synonyms/cefr/source/image upload → refetch thấy (§6.1)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "quả táo");
    await openEditDialog(page, "qa-cms-alpha");

    // pos + synonyms
    await page.locator("#catalog-edit-pos").fill("noun");
    await page.locator("#catalog-edit-synonyms").fill("pomme ,  bưởi");

    // cefr B1 → A2 (PATCH cefr — trước SF-1 không sửa được) + source Oxford
    await selectOption(page, "catalog-edit-cefr", "A2");
    await selectOption(page, "catalog-edit-source", "Oxford");

    // image upload qua route SF-1 → preview thumb hiện TRƯỚC save
    await page
      .locator("#catalog-edit-image")
      .setInputFiles({ name: "qa-cms-thumb.png", mimeType: "image/png", buffer: PNG_1PX });
    const preview = page.getByRole("img", { name: "Xem trước ảnh minh hoạ" });
    await expect(preview).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(
      page.getByText("Đã lưu thay đổi của từ “qa-cms-alpha”."),
    ).toBeVisible();

    // refetch — badge pos + synonyms + badge cefr mới
    await expect(row(page, "qa-cms-alpha")).toContainText("noun");
    await expect(row(page, "qa-cms-alpha")).toContainText("Đồng nghĩa: pomme, bưởi");
    await expect(row(page, "qa-cms-alpha")).toContainText("A2");
    await expect(row(page, "qa-cms-alpha")).toContainText("Oxford");
  });

  test("t5: thêm từ global — orphan hợp lệ (§6.1)", async ({ page }) => {
    await gotoCatalog(page);

    await page.getByRole("button", { name: "Thêm từ", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Thêm từ mới" }),
    ).toBeVisible();
    // note orphan trong dialog
    await expect(
      page.getByText("Không bắt buộc gắn sách", { exact: false }),
    ).toBeVisible();

    await page.locator("#catalog-add-word").fill("qa-cms-epsilon");
    await page.locator("#catalog-add-meaning").fill("từ mới qa-cms");
    await selectOption(page, "catalog-add-cefr", "C1");
    await page.getByRole("button", { name: "Thêm từ", exact: true }).last().click();
    await expect(
      page.getByText("Đã thêm từ “qa-cms-epsilon”."),
    ).toBeVisible();

    await search(page, "qa-cms-epsilon");
    await expect(row(page, "qa-cms-epsilon")).toBeVisible();
    await expect(row(page, "qa-cms-epsilon")).toContainText("C1");
    await expect(row(page, "qa-cms-epsilon")).toContainText("Chưa gắn sách");
  });

  test("t6: bulk gán 2 books → toast report + từ xuất hiện ở public book page (§6.2)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "qa-cms-page");
    await selectOption(page, "catalog-sort", "Theo từ (A→Z)");
    await expect(row(page, "qa-cms-page-01")).toBeVisible(); // data ổn định

    // select-all trang 1 (50 rows — none pre-assigned)
    await setChecked(
      page.getByRole("checkbox", { name: "Chọn cả trang" }),
      true,
    );
    await expect(page.getByText("Đã chọn 50")).toBeVisible();

    await page.getByRole("button", { name: "Gán sách", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Gán 50 từ vào sách" }),
    ).toBeVisible();
    await setChecked(page.getByRole("checkbox", { name: "QA Sách A" }), true);
    await setChecked(page.getByRole("checkbox", { name: "QA Sách B" }), true);
    await page
      .getByRole("button", { name: "Gán vào sách" })
      .click();

    // toast report shape {affected, skipped} — 50×2 link mới, 0 bỏ qua
    await expect(
      page.getByText("Đã gán sách: 100 liên kết mới · 0 bỏ qua"),
    ).toBeVisible({ timeout: 60_000 });

    // chips books trên row + public book page thấy từ (revalidateContent)
    await expect(row(page, "qa-cms-page-01")).toContainText("QA Sách A");
    await page.goto("/vi/books/qa-cms-book-a/vocabulary", { timeout: 120_000 });
    await expect(page.getByText("qa-cms-page-01")).toBeVisible();
    await expect(page.getByText("qa-cms-page-50")).toBeVisible();
  });

  test("t7: bulk tag CEFR OVERWRITE từ đã có badge (§6.2)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "qa-cms-page-0");
    await selectOption(page, "catalog-sort", "Theo từ (A→Z)");
    await expect(row(page, "qa-cms-page-01")).toBeVisible(); // data ổn định

    // page-01..page-09 — chưa tag → tag B2 trước
    await setChecked(page.getByRole("checkbox", { name: "Chọn cả trang" }), true);
    await expect(page.getByText("Đã chọn 9")).toBeVisible();
    await page.getByRole("button", { name: "Tag CEFR" }).click();
    await expect(
      page.getByText(
        "CẢNH BÁO: CEFR hiện có của từ được chọn sẽ bị GHI ĐÈ bởi giá trị mới.",
      ),
    ).toBeVisible();
    await selectOption(page, "bulk-tag-cefr", "B2");
    await page.getByRole("button", { name: "Ghi đè CEFR" }).click();
    await expect(
      page.getByText("Đã tag CEFR cho 9 từ"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(row(page, "qa-cms-page-01")).toContainText("B2");

    // OVERWRITE pin: B2 → A1 (từ ĐÃ có badge bị đè — teacher intent)
    await setChecked(page.getByRole("checkbox", { name: "Chọn cả trang" }), true);
    await page.getByRole("button", { name: "Tag CEFR" }).click();
    await selectOption(page, "bulk-tag-cefr", "A1");
    await page.getByRole("button", { name: "Ghi đè CEFR" }).click();
    await expect(page.getByText("Đã tag CEFR cho 9 từ")).toBeVisible({ timeout: 60_000 });
    await expect(row(page, "qa-cms-page-01")).toContainText("A1");
  });

  test("t8: bulk xoá 2-phase — dry-run progressAffected → public page biến mất (§6.2)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "qa-cms-delta");
    await setChecked(
      page.getByRole("checkbox", { name: "Chọn từ qa-cms-delta" }),
      true,
    );

    // 2-phase: dry-run trước — dialog confirm hiện số progress sẽ cascade
    await page.getByRole("button", { name: "Xoá", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(/Sẽ xoá 1 từ\. Tiến độ học \(SRS\) của 1 lượt học viên/),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Xoá vĩnh viễn" }).click();
    await expect(
      page.getByText("Đã xoá 1 từ · tiến độ ảnh hưởng: 1"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(row(page, "qa-cms-delta")).toBeHidden();

    // public book page — từ biến mất
    await page.goto("/vi/books/qa-cms-book-a/vocabulary", { timeout: 120_000 });
    await expect(page.getByText("qa-cms-page-01")).toBeVisible(); // book vẫn còn từ khác
    await expect(page.getByText("qa-cms-delta")).toHaveCount(0);
  });

  test("t9: export CSV giữ filter — filename + BOM + header 10 cột (§6.2)", async ({
    page,
  }) => {
    await gotoCatalog(page);
    await search(page, "qa-cms-page");
    // chờ filter commit (debounce 300ms + refetch) — export click trước đó
    // sẽ mang filter CŨ (đủ 59 từ, sai kỳ vọng 55)
    await expect(page.getByText("55 từ khớp")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("button", { name: "Xuất CSV" }).click(),
    ]);
    // filename pattern spec §5.6
    expect(download.suggestedFilename()).toMatch(/^vocabulary-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");
    // BOM UTF-8 (U+FEFF) + header 10 cột đúng thứ tự spec §5.6
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toContain(
      "word,ipa,meaning_vi,example,cefr,source,pos,synonyms,audio_url,image_url",
    );
    // đúng filter (chỉ fixture page words — 55 dòng data)
    const dataLines = csv.split("\n").filter((line) => line.includes("qa-cms-page"));
    expect(dataLines.length).toBe(55);
    expect(csv).not.toContain("qa-cms-alpha");
  });

  test("t10: regression per-book manager cũ vẫn chạy (§6.1)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/books/qa-cms-book-a/vocabulary", {
      timeout: 120_000,
    });
    await expect(page).toHaveURL((u) =>
      u.pathname === "/admin/books/qa-cms-book-a/vocabulary",
    );

    // bảng per-book + search client-side cũ hoạt động (alpha gắn book A từ seed
    // — t10 tự lập không phụ thuộc mutation t6)
    await expect(
      page.getByRole("cell", { name: "qa-cms-alpha" }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByPlaceholder("Tìm theo từ hoặc nghĩa…")
      .fill("qa-cms-alpha");
    await expect(
      page.getByRole("cell", { name: "qa-cms-alpha" }).first(),
    ).toBeVisible();

    // dialog sửa cũ mở được (không vỡ bởi field mới additive) — button aria
    // label chỉ "Sửa" (vocabulary-manager cũ) → scope theo row
    await row(page, "qa-cms-alpha")
      .getByRole("button", { name: "Sửa", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sửa từ “qa-cms-alpha”" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
  });
});

import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";

/**
 * E2E curation queue Oxford + audio backfill (VU-43 SF-3 — spec §6.3/§6.4,
 * test-ownership map §8: playwright.admin.config). SF-2 CHẠY SONG SONG →
 * catalog UI KHÔNG assert — kết quả promote/backfill khẳng định qua
 * GET /api/admin/vocabulary + DB row (ownership chéo dồn SF-4 convergence).
 *
 * Fixture `qa-cms-<tok>-*` unique-per-run (tok base36 — words.word UNIQUE
 * case-sensitive trên shared Neon; convention §8): 5 entry curation + 5 entry
 * backfill blob + 1 pending + book fixture; self-clean beforeAll/afterAll qua
 * cleanup helper dùng chung `e2e/helpers/cleanup-vocab-cms.ts --apply` + book
 * slug riêng. Entry seed = raw SQL mirror seedCrawlEntry (enrich import @/db —
 * không resolve ngoài Next/vitest, pattern oxford-crawl-fixture).
 *
 * KHÔNG đụng words/crawl_entries ngoài fixture (backfill scope book bắt buộc
 * — control word ngoài scope assert audio_url giữ NULL).
 */
dotenv.config({ path: ".env.local" });

test.setTimeout(180_000); // dev-server compile lạnh (webpack) + shared Neon

const TOK = Date.now().toString(36);
// Prefix DASH `qa-cms-` bắt buộc — khớp cleanup pattern 'qa-cms-%' của helper
// dùng chung SF-1 (prefix space "qa-cms " KHÔNG match LIKE → leak shared Neon)
const WORD = (name: string) => `qa-cms-${TOK}-${name}`;
const SLUG = (name: string) => `qa-cms-${TOK}-${name}`;
const BOOK_SLUG = `qa-cms-book-${TOK}`;
const BOOK_LABEL = `QA CMS Book ${TOK}`;
const BLOB = (name: string) => `https://qa-blob.test/audio/oxford/${SLUG(name)}-uk.mp3`;

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

/** INSERT crawl_entries mirror seedCrawlEntry (ON CONFLICT slug DO UPDATE). */
async function seedCrawlEntry(
  c: postgres.Sql,
  row: {
    slug: string;
    word?: string | null;
    ipaUk?: string | null;
    ipaUs?: string | null;
    cefr?: string | null;
    pos?: string | null;
    audioUkBlob?: string | null;
    ox3000?: boolean;
    example?: string | null;
    status?: "pending" | "parsed";
  },
): Promise<void> {
  const status = row.status ?? "parsed";
  const raw =
    status === "parsed"
      ? {
          headword: row.word ?? row.slug,
          senses: [
            {
              def: null,
              examples: row.example != null ? [row.example] : [],
            },
          ],
          idioms: [],
          phrasalVerbs: [],
        }
      : null;
  await c`
    INSERT INTO crawl_entries (slug, word, ipa_uk, ipa_us, cefr, pos, ox3000,
                               audio_uk_blob, raw, status)
    VALUES (${row.slug}, ${row.word ?? null}, ${row.ipaUk ?? null}, ${row.ipaUs ?? null},
            ${row.cefr ?? null}, ${row.pos ?? null}, ${row.ox3000 ?? false},
            ${row.audioUkBlob ?? null}, ${raw === null ? null : c.json(raw)}, ${status})
    ON CONFLICT (slug) DO UPDATE SET
      word = EXCLUDED.word, ipa_uk = EXCLUDED.ipa_uk, ipa_us = EXCLUDED.ipa_us,
      cefr = EXCLUDED.cefr, pos = EXCLUDED.pos, ox3000 = EXCLUDED.ox3000,
      audio_uk_blob = EXCLUDED.audio_uk_blob, raw = EXCLUDED.raw, status = EXCLUDED.status`;
}

async function seedWord(
  c: postgres.Sql,
  word: string,
  meaning: string,
  audioUrl: string | null = null,
): Promise<number> {
  const [row] = await c<{ id: number }[]>`
    INSERT INTO words (word, meaning_vi, audio_url)
    VALUES (${word}, ${meaning}, ${audioUrl})
    ON CONFLICT (word) DO UPDATE SET meaning_vi = EXCLUDED.meaning_vi
    RETURNING id`;
  return row!.id;
}

let bookId = 0;

test.beforeAll(async () => {
  const c = db();
  // self-clean leftover run cũ (book riêng — không quét prefix chung chống
  // đụng run song song SF-2) + words/entries qua helper dùng chung SF-1
  await c`DELETE FROM books WHERE slug = ${BOOK_SLUG}`; // cascade book_words
  execSync("node e2e/helpers/cleanup-vocab-cms.ts --apply", {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  // book fixture — id mới nhất trong dải fixture (books.id KHÔNG identity)
  const [bk] = await c<{ id: number }[]>`
    INSERT INTO books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    VALUES ((SELECT coalesce(max(id), 900000) + 1 FROM books WHERE id >= 900000),
            ${BOOK_SLUG}, ${BOOK_LABEL}, ${BOOK_LABEL}, 'A1', '#3366cc', 9000)
    RETURNING id`;
  bookId = bk!.id;

  // entry curation (status parsed) + 1 pending (word null — pretty slug)
  await seedCrawlEntry(c, {
    slug: SLUG("alpha"),
    word: WORD("alpha"),
    ipaUk: "/ˈælfə/",
    ipaUs: "/ˈælfə/",
    cefr: "A2",
    pos: "noun",
    ox3000: true,
    audioUkBlob: BLOB("alpha"),
    example: "This is an alpha test.",
  });
  await seedCrawlEntry(c, {
    slug: SLUG("bravo"),
    word: WORD("bravo"),
    cefr: "A1",
    pos: "adjective",
  });
  await seedCrawlEntry(c, {
    slug: SLUG("charlie"),
    word: WORD("charlie"),
    cefr: "B2",
    pos: "verb",
    ox3000: true,
    audioUkBlob: BLOB("charlie"),
  });
  await seedCrawlEntry(c, {
    slug: SLUG("dup"),
    word: WORD("dupword"),
    cefr: "B1",
    pos: "noun",
  });
  // word trùng theo duplicate predicate §4 (lower+trim 2 phía) — badge
  // "đã có từ" + promote skip duplicates=1 (P0 review round 1: thiếu seed
  // này → test 3 báo created=2 thay vì created=1+duplicates=1)
  await seedWord(c, WORD("dupword"), `trùng sẵn ${TOK}`);
  await seedCrawlEntry(c, { slug: SLUG("pend"), status: "pending" });
  // backfill: 5 entry blob + 5 word thiếu audio trong book fixture
  for (let i = 1; i <= 5; i++) {
    await seedCrawlEntry(c, {
      slug: SLUG(`bf-${i}`),
      word: WORD(`bf ${i}`),
      cefr: "B1",
      audioUkBlob: BLOB(`bf-${i}`),
    });
    const wordId = await seedWord(c, WORD(`bf ${i}`), `kiểm thử backfill ${i}`);
    await c`
      INSERT INTO book_words (book_id, word_id, "order")
      VALUES (${bookId}, ${wordId}, ${i})
      ON CONFLICT (book_id, word_id) DO NOTHING`;
  }
  // control word NGOÀI scope (không gắn book — audio phải giữ NULL)
  await seedWord(c, WORD("outside"), `ngoài scope ${TOK}`);
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
  // verify sạch
  const v = db();
  const [left] = await v<{ words: number; entries: number }[]>`
    SELECT (SELECT count(*) FROM words WHERE word LIKE 'qa-cms-%')::int AS words,
           (SELECT count(*) FROM crawl_entries WHERE slug LIKE 'qa-cms-%')::int AS entries`;
  await v.end();
  expect(left!.words).toBe(0);
  expect(left!.entries).toBe(0);
});

async function loginCuration(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/vocabulary/curation");
  await expect(
    page.getByRole("heading", { name: "Curation queue Oxford" }),
  ).toBeVisible({ timeout: 90_000 }); // compile lạnh lần đầu
}

async function searchTok(page: Page): Promise<void> {
  await page.getByLabel("Tìm headword").fill(`qa-cms-${TOK}`);
  await page.getByLabel("Tìm headword").press("Enter");
  await expect(page.getByText("8 entry khớp")).toBeVisible();
}

async function selectEntry(page: Page, name: string): Promise<void> {
  await page
    .getByRole("checkbox", { name: `Chọn ${WORD(name)}` })
    .check();
}

/** Cell headword — accessible name có badge kèm nên match qua text chứa. */
function headwordCell(page: Page, text: string) {
  return page.getByTestId("headword").filter({ hasText: text });
}

async function openMeaningGrid(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Soạn nghĩa VI" }).click();
  await expect(
    page.getByText(/Soạn nghĩa tiếng Việt \(\d+ entries?\)/),
  ).toBeVisible();
}

async function fillMeaning(page: Page, name: string, meaning: string): Promise<void> {
  await page
    .getByLabel(`Nghĩa VI cho ${WORD(name)}`)
    .fill(meaning);
}

async function promoteViaDialog(page: Page): Promise<void> {
  await page.getByTestId("promote-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: BOOK_LABEL }).click();
  await page.getByTestId("promote-confirm").click();
}

async function vocabApi(page: Page, q: string): Promise<{
  items: Record<string, unknown>[];
  total: number;
}> {
  const res = await page.request.get(
    `/api/admin/vocabulary?q=${encodeURIComponent(q)}`,
  );
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as {
    ok: boolean;
    items: Record<string, unknown>[];
    total: number;
  };
  expect(body.ok).toBe(true);
  return { items: body.items, total: body.total };
}

test("browse: bảng parsed + filter CEFR/OX3000 + search headword + status pending pretty slug", async ({
  page,
}) => {
  await loginCuration(page);
  await searchTok(page);

  // 8 entry parsed khớp tok (alpha, bravo, charlie, dup, bf-1..5)
  for (const name of ["alpha", "bravo", "charlie", "dupword", "bf 1", "bf 5"]) {
    await expect(headwordCell(page, WORD(name))).toBeVisible();
  }

  // filter CEFR A2 + OX3000 → đúng tập (chỉ alpha trong fixture tok)
  await page.getByRole("button", { name: "A2", exact: true }).click();
  await expect(page.getByText("1 entry khớp")).toBeVisible();
  await page.getByLabel("OX3000").click();
  await page.getByRole("option", { name: "Chỉ OX3000" }).click();
  await expect(page.getByText("1 entry khớp")).toBeVisible();
  await expect(page.getByText("1 entry khớp")).toBeVisible();
  await expect(headwordCell(page, WORD("alpha"))).toBeVisible();
  await expect(headwordCell(page, WORD("bravo"))).toBeHidden();

  // reset → search headword ĐẦY ĐỦ 1 entry (match word COALESCE slug)
  await page.getByRole("button", { name: "Đặt lại" }).click();
  await page.getByLabel("Tìm headword").fill(WORD("charlie"));
  await page.getByLabel("Tìm headword").press("Enter");
  await expect(page.getByText("1 entry khớp")).toBeVisible();

  // status pending → entry word null hiển thị pretty slug "qa cms <tok> pend"
  await page.getByRole("button", { name: "Đặt lại" }).click();
  await page.getByLabel("Trạng thái").click();
  await page.getByRole("option", { name: "Đang chờ" }).click();
  await expect(page.getByText("1 entry khớp")).toBeVisible();
  await expect(headwordCell(page, `qa cms ${TOK} pend`)).toBeVisible();

  // pagination server-side: 8 rows ≤ 50 → 1 trang, prev/next disabled
  await page.getByRole("button", { name: "Đặt lại" }).click();
  await searchTok(page);
  await expect(page.getByText("Trang 1 / 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trang trước" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
});

test("promote 2 entry → toast created=2; GET API + DB row đúng fields (SF-2 song song — KHÔNG assert catalog UI)", async ({
  page,
}) => {
  await loginCuration(page);
  await searchTok(page);
  await selectEntry(page, "alpha");
  await selectEntry(page, "bravo");
  await openMeaningGrid(page);
  await fillMeaning(page, "alpha", `kiểm thử alpha ${TOK}`);
  await fillMeaning(page, "bravo", `kiểm thử bravo ${TOK}`);
  await promoteViaDialog(page);

  await expect(page.getByText("Đã tạo 2 từ mới")).toBeVisible();
  // report trong dialog
  await expect(page.getByText("Kết quả promote")).toBeVisible();
  await expect(page.getByText("Từ mới: 2")).toBeVisible();

  // GET API — 2 từ mới đúng fields (spec §4: promote ipa uk→us, cefr, pos,
  // source oxford-ld, audio blob best-effort, example sense 1, meaning VI)
  const alpha = await vocabApi(page, WORD("alpha"));
  expect(alpha.total).toBe(1);
  expect(alpha.items[0]).toMatchObject({
    word: WORD("alpha"),
    meaningVi: `kiểm thử alpha ${TOK}`,
    ipa: "/ˈælfə/",
    cefr: "A2",
    source: "oxford-ld",
    pos: "noun",
    audioUrl: BLOB("alpha"),
    example: "This is an alpha test.",
  });
  const bravo = await vocabApi(page, WORD("bravo"));
  expect(bravo.total).toBe(1);
  expect(bravo.items[0]).toMatchObject({
    word: WORD("bravo"),
    meaningVi: `kiểm thử bravo ${TOK}`,
    cefr: "A1",
    source: "oxford-ld",
    pos: "adjective",
  });

  // DB row — gắn đúng book fixture
  const c = db();
  const [link] = await c<{ n: number }[]>`
    SELECT count(*)::int AS n FROM book_words
    WHERE book_id = ${bookId}
      AND word_id IN (SELECT id FROM words WHERE word IN (${WORD("alpha")}, ${WORD("bravo")}))`;
  await c.end();
  expect(link!.n).toBe(2);

  // badge "đã có từ" cập nhật sau refetch (scope row alpha — không match giả)
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(
    page
      .locator("tr", { has: headwordCell(page, WORD("alpha")) })
      .getByTestId("has-word-badge"),
  ).toBeVisible({ timeout: 30_000 });
});

test("meaning gate: thiếu 1 nghĩa → promote disabled; entry trùng → skip + batch không chết + hint merge", async ({
  page,
}) => {
  await loginCuration(page);
  await searchTok(page);
  await selectEntry(page, "charlie");
  await selectEntry(page, "dupword");
  await openMeaningGrid(page);

  // badge "đã có từ" trên ĐÚNG row dupword (duplicate predicate §4 —
  // scope theo row chặn match giả badge của entry khác)
  await expect(
    page
      .locator("tr", { has: headwordCell(page, WORD("dupword")) })
      .getByTestId("has-word-badge"),
  ).toBeVisible();

  await fillMeaning(page, "charlie", `kiểm thử charlie ${TOK}`);
  await expect(page.getByTestId("meaning-missing-count")).toHaveText(
    "Còn thiếu 1 nghĩa",
  );
  await expect(page.getByTestId("promote-open")).toBeDisabled();

  await fillMeaning(page, "dupword", `kiểm thử dup ${TOK}`);
  await expect(page.getByTestId("meaning-missing-count")).toHaveText(
    "Đã đủ nghĩa — có thể promote",
  );
  await expect(page.getByTestId("promote-open")).toBeEnabled();

  await promoteViaDialog(page);
  await expect(page.getByText("Kết quả promote")).toBeVisible();
  await expect(page.getByText("Từ mới: 1")).toBeVisible();
  await expect(page.getByText("Trùng (bỏ qua): 1")).toBeVisible();
  await expect(
    page.getByText(/Entry trùng đã có từ trong catalog/),
  ).toBeVisible(); // hint merge — batch KHÔNG chết

  const charlie = await vocabApi(page, WORD("charlie"));
  expect(charlie.total).toBe(1);
  expect(charlie.items[0]).toMatchObject({
    word: WORD("charlie"),
    cefr: "B2",
    pos: "verb",
    audioUrl: BLOB("charlie"),
  });
});

test("promote toàn duplicate → created=0 vẫn toast thành công (batch không chết)", async ({
  page,
}) => {
  await loginCuration(page);
  await searchTok(page);
  await selectEntry(page, "dupword");
  await openMeaningGrid(page);
  await fillMeaning(page, "dupword", `kiểm thử dup lại ${TOK}`);
  await promoteViaDialog(page);

  await expect(
    page.getByText("Không có từ mới — 1 entry trùng đã bỏ qua"),
  ).toBeVisible();
  await expect(page.getByText("Trùng (bỏ qua): 1")).toBeVisible();

  const dup = await vocabApi(page, WORD("dupword"));
  expect(dup.total).toBe(1); // không tạo row mới
});

test("backfill scope book: dry-run plan khớp seed → apply 5 → dry-run lại matched=0; word ngoài scope giữ NULL", async ({
  page,
}) => {
  await loginCuration(page);

  // scope = book fixture
  await page.getByLabel("Sách (scope bắt buộc)").click();
  await page.getByRole("option", { name: BOOK_LABEL }).click();
  await page.getByTestId("backfill-dry-run").click();

  // plan khớp seed: 5 word thiếu audio đều có entry blob → matched 5
  await expect(page.getByTestId("backfill-plan")).toBeVisible();
  await expect(page.getByText("Matched (copy blob): 5")).toBeVisible();
  await expect(page.getByText("Pending (chưa có blob): 0")).toBeVisible();
  await expect(page.getByText("Missing (không có entry): 0")).toBeVisible();

  // apply → toast report
  await page.getByTestId("backfill-apply").click();
  await expect(page.getByText("Đã gán audio cho 5 từ")).toBeVisible();

  // DB — 5 từ được gán audio_url = blob fixture; control ngoài scope giữ NULL
  const c = db();
  const rows = await c<{ word: string; audio_url: string | null }[]>`
    SELECT word, audio_url FROM words WHERE word LIKE ${`qa-cms-${TOK}-bf-%`} ORDER BY word`;
  const [outside] = await c<{ audio_url: string | null }[]>`
    SELECT audio_url FROM words WHERE word = ${WORD("outside")}`;
  await c.end();
  expect(rows).toHaveLength(5);
  for (let i = 1; i <= 5; i++) {
    const row = rows.find((r) => r.word === WORD(`bf ${i}`));
    expect(row!.audio_url).toBe(BLOB(`bf-${i}`));
  }
  expect(outside!.audio_url).toBeNull(); // KHÔNG đụng words ngoài scope

  // dry-run lại → marker tự nhiên audio_url IS NULL hết → matched=0
  await page.getByTestId("backfill-dry-run").click();
  await expect(page.getByText("Matched (copy blob): 0")).toBeVisible();
  await expect(
    page.getByText("Không có từ nào thiếu audio khớp entry có blob."),
  ).toBeVisible();
});

test("a11y: grid input label gắn headword, dialog focus-trap + Esc, keyboard checkbox, contrast screenshots", async ({
  page,
}) => {
  await loginCuration(page);
  await searchTok(page);

  // checkbox aria-label theo headword — keyboard operable
  const checkbox = page.getByRole("checkbox", { name: `Chọn ${WORD("alpha")}` });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();

  await openMeaningGrid(page);
  // grid input label gắn headword (a11y acceptance #5) — fill qua label
  const meaningInput = page.getByLabel(`Nghĩa VI cho ${WORD("alpha")}`);
  await meaningInput.fill(`a11y ${TOK}`);
  await expect(meaningInput).toBeFocused();

  // dialog focus-trap: focus rơi vào trong dialog; Esc đóng
  await page.getByTestId("promote-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const insideDialog = await page.evaluate(() =>
    (document.activeElement?.closest('[role="dialog"]') ?? null) !== null,
  );
  expect(insideDialog).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // screenshots bằng chứng contrast + layout (admin vi — badge theme tokens)
  await page.screenshot({
    path: "test-results/sf3-curation/table.png",
    fullPage: true,
  });
  await selectEntry(page, "charlie");
  // grid còn mở (Esc chỉ đóng dialog) — entry charlie gia nhập grid
  await fillMeaning(page, "charlie", `a11y charlie ${TOK}`);
  await page.screenshot({
    path: "test-results/sf3-curation/meaning-grid.png",
    fullPage: true,
  });
  await page.getByTestId("promote-open").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("combobox").click();
  await page.getByRole("option", { name: BOOK_LABEL }).click();
  await page.screenshot({
    path: "test-results/sf3-curation/promote-dialog.png",
    fullPage: false,
  });
});

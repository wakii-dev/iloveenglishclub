import { expect, test, type Page } from "@playwright/test";
import {
  HUB_WORDS,
  cleanupLibraryBulkWords,
  countAllWords,
  seedHubProgress,
  seedLibraryBulkWords,
} from "./vocabulary-hub-fixture";

/**
 * E2E tab Thư viện (story vocabulary-hub SF-2 t-2.3): danh sách toàn bảng
 * (fixture qa-hub-3 từ + 55 từ độc lập qa-lib-), nút "Học từ này" prefill
 * phiên review /me/vocabulary?word= (SF-3 — flashcard nghỉ hưu), search
 * debounce + filter audio/book, pagination 50/trang, i18n vi + guest duyệt
 * không trạng thái. Tên spec `hub-library` (né testMatch `/vocabulary*`
 * config khác — như hub-overview). Fixture qa-hub-* do globalSetup seed;
 * qa-lib-* spec tự seed + afterAll dọn.
 * SF-5 convergence: DB template còn 6 từ demo non-qa (4 từ có audio, tất cả
 * thuộc book level-1) — count assertion KHÔNG được hardcode "chỉ có qa-*".
 */

const [ALPHA, BRAVO, CHARLIE] = HUB_WORDS;

function qaEmail(tag: string): string {
  return `qa-hub-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern hub-overview.spec.ts) → trả email. */
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

function qaRows(page: Page) {
  return page.getByRole("row").filter({ hasText: "qa-" });
}

test.describe("Vocabulary hub library (SF-2)", () => {
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await cleanupLibraryBulkWords();
  });

  test("EN: danh sách + Học từ này prefill phiên review", async ({ page }) => {
    const email = await registerUser(page, "QA Lib EN");
    await seedHubProgress(email);

    await page.goto("/en/vocabulary?tab=library");
    await expect(
      page.getByRole("heading", { level: 2, name: "Word library" }),
    ).toBeVisible();

    // toàn bảng: 3 từ fixture (55 bulk thêm ở test pagination — test tuần tự)
    const rows = qaRows(page);
    await expect(rows).toHaveCount(3);
    // trạng thái SRS của tôi: alpha đến hạn, charlie đang học (fixture seed)
    await expect(rows.filter({ hasText: ALPHA.word })).toContainText("Due");
    await expect(
      rows.filter({ hasText: CHARLIE.word }),
    ).toContainText("Learning");
    // fixture không có audio → cột audio "—"
    await expect(rows.filter({ hasText: BRAVO.word })).toContainText("—");

    // "Học từ này" trên từ CHƯA đến hạn → prefill phiên review đúng từ đó
    await rows
      .filter({ hasText: CHARLIE.word })
      .getByRole("link", { name: "Learn this word" })
      .click();
    await page.waitForURL(/\/en\/me\/vocabulary\?word=\d+/);
    // due list vẫn 1 (alpha) — charlie chỉ vào hàng qua prefill
    await expect(page.getByText(/1 word to review today/)).toBeVisible();
    // SF-3: flashcard nghỉ hưu — prefill mở SESSION RUNNER; prefill queue
    // 1 từ → pool degenerate 1 nghĩa → engine BỎ MC, mở thẳng bước type
    // (learn-session.ts buildReviewSteps) — prompt nghĩa phải là THÂN
    // charlie (mcOption giữ làm nhánh phòng hờ nếu engine đổi pool)
    await expect(page.getByTestId("step-card")).toBeVisible();
    const mcOption = page
      .getByTestId("option-group")
      .getByText(CHARLIE.word);
    const typePrompt = page
      .getByTestId("type-prompt")
      .filter({ hasText: CHARLIE.meaning });
    await expect(mcOption.or(typePrompt).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("EN: search + filter audio/book hoạt động", async ({ page }) => {
    const email = await registerUser(page, "QA Lib EN Filter");
    await seedHubProgress(email);

    await page.goto("/en/vocabulary?tab=library");
    const rows = qaRows(page);
    await expect(rows).toHaveCount(3);

    // search debounce → URL search= + đúng 1 hàng (input type=search → role searchbox)
    const searchBox = page.getByRole("searchbox", { name: "Search words" });
    await searchBox.fill(ALPHA.word);
    await expect(page).toHaveURL(/search=qa-hub-alpha/);
    await expect(rows).toHaveCount(1);
    await expect(rows.filter({ hasText: ALPHA.word })).toBeVisible();

    // xoá search → full lại
    await searchBox.fill("");
    await expect(page).toHaveURL(/\/en\/vocabulary\?tab=library$/);
    await expect(rows).toHaveCount(3);

    // search vô nghĩa → 0 hàng TOÀN BẢNG → empty-filter state (SF-5: 6 từ
    // template DB có audio nên filter audio không còn rỗng — coverage
    // empty-state chuyển sang search không khớp)
    await searchBox.fill("zzqqxq-no-hit");
    await expect(page).toHaveURL(/search=zzqqxq-no-hit/);
    await expect(
      page.getByText("No words match these filters."),
    ).toBeVisible();
    await searchBox.fill("");
    await expect(page).toHaveURL(/\/en\/vocabulary\?tab=library$/);
    await expect(rows).toHaveCount(3);

    // filter audio: fixture không từ nào có audio → 0 hàng qa- (4/6 từ
    // template DB có audio — hàng non-qa không vào count qaRows)
    await page
      .getByRole("combobox", { name: "Filter by audio" })
      .click();
    await page.getByRole("option", { name: "With audio" }).click();
    await expect(page).toHaveURL(/audio=1/);
    await expect(rows).toHaveCount(0);

    // tắt audio, filter book Level 1 → chỉ charlie
    await page
      .getByRole("combobox", { name: "Filter by audio" })
      .click();
    await page.getByRole("option", { name: "All words" }).click();
    await expect(page).toHaveURL(/\/en\/vocabulary\?tab=library$/);
    await page
      .getByRole("combobox", { name: "Filter by book" })
      .click();
    // level-1 seed titleEn "Level 1 — Starter" (level 2–7 mới là "Level N")
    await page
      .getByRole("option", { name: "Level 1 — Starter", exact: true })
      .click();
    await expect(page).toHaveURL(/book=1/);
    await expect(rows).toHaveCount(1);
    await expect(rows.filter({ hasText: CHARLIE.word })).toBeVisible();
  });

  test("EN: phân trang 50/trang (55 từ độc lập qa-lib-)", async ({ page }) => {
    await registerUser(page, "QA Lib EN Paging");
    await seedLibraryBulkWords();
    // expected ĐỘNG: tổng words thật (3 qa-hub + 55 qa-lib + từ template DB)
    const total = await countAllWords();

    await page.goto("/en/vocabulary?tab=library");
    // trang 1: đúng 50 hàng/trang (đếm TẤT CẢ hàng tbody — từ template DB
    // non-qa sort trước qa-* cũng chiếm chỗ, không hardcode)
    const dataRows = page.locator("table tbody tr");
    await expect(page.getByText("Page 1/2")).toBeVisible();
    await expect(dataRows).toHaveCount(50);

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("Page 2/2")).toBeVisible();
    await expect(dataRows).toHaveCount(total - 50);

    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page).toHaveURL(/\/en\/vocabulary\?tab=library$/);
    await expect(page.getByText("Page 1/2")).toBeVisible();
    // từ độc lập: cột Sách "—" (hàng qa-lib không gắn book_words)
    await expect(
      dataRows.filter({ hasText: "qa-lib-001" }),
    ).toContainText("—");
  });

  test("VI + guest: duyệt Thư viện không cần đăng nhập, không cột trạng thái", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/vi/vocabulary");
    await expect(
      page.getByRole("heading", { level: 2, name: "Thư viện từ vựng" }),
    ).toBeVisible();
    // test trước để lại 55 qa-lib — đếm riêng fixture qa-hub-
    const rows = page.getByRole("row").filter({ hasText: "qa-hub-" });
    await expect(rows).toHaveCount(3);
    // guest: không cột "Trạng thái SRS", nhãn nút tiếng Việt
    await expect(page.getByText("Trạng thái SRS")).toHaveCount(0);
    await expect(
      rows.filter({ hasText: ALPHA.word }).getByRole("link", { name: "Học từ này" }),
    ).toBeVisible();
    // guest đòi Tổng quan → login kèm ?next (data cá nhân)
    await page.getByRole("link", { name: "Tổng quan" }).click();
    await expect(page).toHaveURL(
      /\/vi\/login\?next=(%2F|\/)vi(%2F|\/)vocabulary/,
    );
  });
});

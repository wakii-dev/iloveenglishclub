import { expect, test, type Page } from "@playwright/test";
import { cleanupQaUnit, loginAsAdmin, qaUnitNumber } from "./admin-lib";

/**
 * Split-sentences UI (spec slice 6): split đúng N câu, unicode nguyên vẹn,
 * viết tắt Mr./e.g. tách sai = BY-DESIGN (limitation note + merge tay sửa),
 * manual fix (merge/split/add/remove), QA-303: >200 câu → guard chặn RÕ
 * (không còn truncate ngầm) + toast/nút đếm non-empty.
 */

const NUM = qaUnitNumber();
const PLACEHOLDER = "Dán toàn bộ script vào đây…";

async function openEditor(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/books/level-3/units");
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(NUM));
  await page.locator("#unit-title-en").fill(`QA Split ${NUM}`);
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page
    .locator("li")
    .filter({ has: page.getByText(String(NUM), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill("Split Probe");
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
}

test.describe("Script splitter (SF-4)", () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
  });

  test.afterAll(async () => {
    await cleanupQaUnit(NUM);
  });

  test("paste 5 câu → preview 5, thêm vào bài → parts editor 5 dòng", async ({
    page,
  }) => {
    const script = [
      "The sun rises early.",
      "My sister plays tennis.",
      "We eat dinner together.",
      "He reads a book.",
      "They walk to the park.",
    ];
    await page.getByPlaceholder(PLACEHOLDER).fill(script.join(" "));
    await page.getByRole("button", { name: "Split câu" }).click();
    await expect(page.getByText("5 câu — sửa tay nếu cần")).toBeVisible();
    await page.getByRole("button", { name: "Thêm 5 câu vào bài" }).click();
    // state RESET đáng tin: placeholder hiện lại = action xong (bài học SF-5)
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible();
    await expect(
      page
        .locator("section", { hasText: "Câu hỏi của bài" })
        .last()
        .locator("ol li textarea"),
    ).toHaveCount(5);
  });

  test("unicode + emoji nguyên vẹn qua split", async ({ page }) => {
    await page
      .getByPlaceholder(PLACEHOLDER)
      .fill("Tiếng Việt có dấu: ễữợ. Emoji 🎵🔥 giữ nguyên. Câu hỏi “What?!” cũng vậy.");
    await page.getByRole("button", { name: "Split câu" }).click();
    // “What?!” — naive split kết thúc run ?! trước ” → 4 câu (BY-DESIGN)
    await expect(page.getByText("4 câu — sửa tay nếu cần")).toBeVisible();
    await expect(page.getByText("Tiếng Việt có dấu: ễữợ.")).toBeVisible();
    await expect(page.getByText("Emoji 🎵🔥 giữ nguyên.")).toBeVisible();
    await expect(page.getByText("Câu hỏi “What?!")).toBeVisible();
    await expect(page.getByText("” cũng vậy.")).toBeVisible();
  });

  test("viết tắt Mr./e.g. tách sai = BY-DESIGN — limitation note + merge tay sửa", async ({
    page,
  }) => {
    await page
      .getByPlaceholder(PLACEHOLDER)
      .fill("Mr. Smith went home. e.g. this is an example.");
    await page.getByRole("button", { name: "Split câu" }).click();
    // BY-DESIGN naive: "e.g." có 2 dấu chấm → tách "Mr." | "Smith went home." |
    // "e." | "g." | "this is an example." = 5 (đúng spec §6 — KHÔNG fix)
    await expect(page.getByText("5 câu — sửa tay nếu cần")).toBeVisible();
    // limitation note hiển thị
    await expect(page.getByText(/viết tắt \(Mr\., e\.g\.\)/)).toBeVisible();

    // merge tay 3 lần (@0, @1, @1) → 2 dòng: [Mr. Smith went home.] [e. g. this…]
    const rows = page.locator("ol li");
    await rows.nth(0).getByRole("button", { name: "Gộp với dòng dưới" }).click();
    await rows.nth(1).getByRole("button", { name: "Gộp với dòng dưới" }).click();
    await rows.nth(1).getByRole("button", { name: "Gộp với dòng dưới" }).click();
    await expect(page.getByText("2 câu — sửa tay nếu cần")).toBeVisible();
    await expect(rows.nth(0)).toContainText("Mr. Smith went home.");
    await expect(rows.nth(1)).toContainText("this is an example.");

    // thêm vào bài → 2 parts
    await page.getByRole("button", { name: "Thêm 2 câu vào bài" }).click();
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible();
    await expect(
      page
        .locator("section", { hasText: "Câu hỏi của bài" })
        .last()
        .locator("ol li textarea"),
    ).toHaveCount(2);
  });

  test("QA-303: 205 câu → guard chặn RÕ (toast Quá 200), KHÔNG chèn im lặng", async ({
    page,
  }) => {
    const many = Array.from({ length: 205 }, (_, i) => `Sentence number ${i + 1}.`);
    await page.getByPlaceholder(PLACEHOLDER).fill(many.join(" "));
    await page.getByRole("button", { name: "Split câu" }).click();
    await expect(page.getByText("205 câu — sửa tay nếu cần")).toBeVisible();
    await page.getByRole("button", { name: "Thêm 205 câu vào bài" }).click();
    // guard action trả lỗi rõ (bản cũ: chèn 200 im lặng + toast "205 câu" sai)
    await expect(page.getByText(/Quá 200 câu một lần/)).toBeVisible();
    // splitter GIỮ preview (không reset) + parts editor vẫn rỗng
    await expect(page.getByText("205 câu — sửa tay nếu cần")).toBeVisible();
    await expect(page.getByText("Chưa có câu nào")).toBeVisible();
  });

  test("dòng rỗng không đếm vào toast/nút (QA-303 — non-empty count)", async ({
    page,
  }) => {
    await page.getByPlaceholder(PLACEHOLDER).fill("First sentence. Second sentence.");
    await page.getByRole("button", { name: "Split câu" }).click();
    await expect(page.getByText("2 câu — sửa tay nếu cần")).toBeVisible();
    // thêm 2 dòng trống thủ công
    await page.getByRole("button", { name: "Thêm dòng" }).nth(0).click();
    await page.getByRole("button", { name: "Thêm dòng" }).nth(1).click();
    await expect(page.getByText("4 câu — sửa tay nếu cần")).toBeVisible();
    // nút đếm NON-EMPTY = 2 (không phải "Thêm 4") — thành công = reset + 2 parts
    await page.getByRole("button", { name: "Thêm 2 câu vào bài" }).click();
    await expect(page.getByPlaceholder(PLACEHOLDER)).toBeVisible();
    await expect(
      page
        .locator("section", { hasText: "Câu hỏi của bài" })
        .last()
        .locator("ol li textarea"),
    ).toHaveCount(2);
  });
});

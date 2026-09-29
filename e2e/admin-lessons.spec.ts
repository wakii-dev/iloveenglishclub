import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQaAccount,
  cleanupQaUnit,
  lessonIdByNumber,
  loginAsAdmin,
  qaUnitNumber,
  seedAttemptOnUnitPart,
  seedQaUser,
  userIdOf,
} from "./admin-lib";

/**
 * Lessons CRUD edge (spec slice 5): auto-number max+1, meta edit (draft +
 * published — public fresh theo revalidate có sẵn), delete rỗng OK, delete có
 * attempt → hasAttempts (RESTRICT), điều hướng editor breadcrumb, vocab bắt
 * buộc. 23505/23503/gate logic phủ ở lessons.test.ts (unit mock).
 */

const NUM = qaUnitNumber();

async function createLessonViaUi(
  page: Page,
  title: string,
): Promise<string> {
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill(title);
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  return page.url();
}

test.describe("Lessons CRUD edge (SF-4)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // unit riêng của spec này
    await page.goto("/admin/books/level-3/units");
    await page.getByRole("button", { name: "Tạo unit mới" }).click();
    await page.locator("#unit-number").fill(String(NUM));
    await page.locator("#unit-title-en").fill(`QA Lessons ${NUM}`);
    await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
    await expect(
      page.locator("li").filter({ has: page.getByText(String(NUM), { exact: true }) }),
    ).toBeVisible();
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM), { exact: true }) })
      .getByRole("link", { name: "Bài học" })
      .click();
  });

  test.afterAll(async () => {
    await cleanupQaUnit(NUM);
    await cleanupQaUnit(NUM + 1); // unit riêng của delete test
    await cleanupQaAccount("sf4-lesson@test.ilec");
    fs.rmSync(`public/audio/level-3/unit-${NUM}`, { recursive: true, force: true });
  });

  test("auto-number 1,2,3 (max+1) + breadcrumb điều hướng", async ({ page }) => {
    const u1 = await createLessonViaUi(page, "Lesson One");
    expect(u1).toMatch(/\/lessons\/1$/);
    await page.goto(`/admin/books/level-3/units/${NUM}/lessons`);
    const u2 = await createLessonViaUi(page, "Lesson Two");
    expect(u2).toMatch(/\/lessons\/2$/);

    // breadcrumb: Sách / unit / Bài N — click về lessons list
    await page.getByRole("link", { name: `Bài ${NUM}` }).click();
    await expect(page).toHaveURL(new RegExp(`/units/${NUM}/lessons$`));
    await expect(page.getByText("Lesson Two")).toBeVisible();
  });

  test("vocab bắt buộc — chưa chọn A2 thì nút Tạo mới disabled", async ({ page }) => {
    await page.getByRole("button", { name: "Tạo bài học" }).click();
    await page.locator("#lesson-title-en").fill("No vocab yet");
    await expect(page.getByRole("button", { name: "Tạo mới", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Hủy" }).click();
  });

  test("sửa meta bài published → public title fresh NGAY (revalidate có sẵn)", async ({
    page,
  }) => {
    const editorUrl = await createLessonViaUi(page, "Meta Original");
    // 1 part + audio + publish (upload path guard nằm ở units spec — ở đây dùng
    // UI hoàn toàn cho part; audio qua API với lessonId resolve từ URL)
    await page
      .getByPlaceholder("Dán toàn bộ script vào đây…")
      .fill(`Meta probe sentence ${NUM}.`);
    await page.getByRole("button", { name: "Split câu" }).click();
    await page.getByRole("button", { name: "Thêm 1 câu vào bài" }).click();
    await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();

    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    // editor URL number-based — resolve DB id qua SQL (không bắn number vào API)
    const realId = await lessonIdByNumber(NUM, lessonNumber);
    const up = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3probe") },
        lessonId: String(realId),
        partIndex: "1",
      },
    });
    expect(up.status()).toBe(200);
    expect(((await up.json()) as { path?: string }).path).toContain(`unit-${NUM}/`);

    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();

    // public thấy title gốc
    const publicUrl = `/en/books/level-3/units/${NUM}/lessons/${lessonNumber}/listen-and-type`;
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Meta Original");

    // sửa meta title
    await page.goto(editorUrl);
    await page.locator("#lesson-meta-title-en").fill(`Meta Renamed ${NUM}`);
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByText("Lưu", { exact: true })).toBeVisible();

    // NAVIGATION MỚI → public title mới NGAY
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `Meta Renamed ${NUM}`,
    );
  });

  test("delete lesson rỗng → OK; delete lesson CÓ attempt → hasAttempts", async ({
    page,
  }) => {
    // UNIT RIÊNG +Attempt Lesson tạo TRƯỚC (chứa part đầu của unit —
    // seedAttemptOnUnitPart bắn vào part đầu; dùng chung unit với test khác
    // là order-dependent — part đầu trúng lesson của test trước)
    const NUM_DEL = NUM + 1;
    await page.goto("/admin/books/level-3/units");
    await page.getByRole("button", { name: "Tạo unit mới" }).click();
    await page.locator("#unit-number").fill(String(NUM_DEL));
    await page.locator("#unit-title-en").fill(`QA Del ${NUM_DEL}`);
    await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM_DEL), { exact: true }) })
      .getByRole("link", { name: "Bài học" })
      .click();

    const withPartUrl = await createLessonViaUi(page, "Attempt Lesson");
    await page
      .getByPlaceholder("Dán toàn bộ script vào đây…")
      .fill(`Attempt sentence ${NUM_DEL}.`);
    await page.getByRole("button", { name: "Split câu" }).click();
    await page.getByRole("button", { name: "Thêm 1 câu vào bài" }).click();
    await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();
    await seedQaUser("sf4-lesson@test.ilec", "SF4 Lesson Attempt");
    const uid = await userIdOf("sf4-lesson@test.ilec");
    await seedAttemptOnUnitPart(NUM_DEL, uid!); // part đầu unit = Attempt Lesson part 1

    // tạo Empty Lesson (lesson 2, không part)
    await page.goto(`/admin/books/level-3/units/${NUM_DEL}/lessons`);
    await createLessonViaUi(page, "Empty Lesson");

    // confirm dialog: dùng on() cho CẢ HAI lần xóa (once tiêu ở lần 1 →
    // lần 2 auto-dismiss → action không chạy)
    page.on("dialog", (d) => d.accept());
    // xóa lesson 1 (có attempt) → toast hasAttempts + lesson VẪN còn
    await page.goto(withPartUrl);
    await page.getByRole("button", { name: "Xóa bài học" }).click();
    await expect(page.getByText(/không xóa được/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Attempt Lesson");

    // xóa lesson 2 (rỗng) → OK về lessons list
    await page.goto(`/admin/books/level-3/units/${NUM_DEL}/lessons`);
    await expect(page.getByText("Empty Lesson")).toBeVisible();
    await page
      .locator("li")
      .filter({ hasText: "Empty Lesson" })
      .getByRole("button", { name: "Xóa" })
      .click();
    await expect(page.getByText("Empty Lesson")).toHaveCount(0);
  });
});

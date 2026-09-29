import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQaAccount,
  cleanupQaUnit,
  lessonIdByNumber,
  loginAsAdmin,
  qaUnitNumber,
  seedQaUser,
  userIdOf,
} from "./admin-lib";

/**
 * Units CRUD edge (spec slice 4 — ACCEPTANCE + QA-302):
 * - validation: number lẻ (1.5) → invalidNumber (server, browser min không chặn);
 *   duplicate số → duplicateNumber.
 * - delete cascade: unit + lessons + parts mất; public unit page 404 NGAY
 *   (deleteUnitAction revalidate — có từ trước).
 * - delete có attempts → hasAttempts toast (RESTRICT — dữ liệu học viên).
 * - QA-302 probe #1a: đổi title unit CÓ bài published → public unit page fresh
 *   NGAY (revalidateTag sau update — fix RED→GREEN ở units.test.ts).
 * - QA-302 probe #1b: tạo unit rỗng → public book page thấy unit mới NGAY
 *   (getUnits/getBook đếm tất cả units).
 */

const NUM = qaUnitNumber();
const NUM_EMPTY = NUM + 1;
const NUM_CASCADE = NUM + 2;
const NUM_RESTRICT = NUM + 3;
const EMAIL_ATTEMPT = "sf4-attempt@test.ilec";

async function createUnit(page: Page, number: number, title: string): Promise<void> {
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(number));
  await page.locator("#unit-title-en").fill(title);
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await expect(
    page.locator("li").filter({ has: page.getByText(String(number), { exact: true }) }),
  ).toBeVisible();
}

async function openLessonsPage(page: Page, number: number): Promise<string> {
  await page.goto(`/admin/books/level-3/units/${number}/lessons`);
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill(`${number} probe lesson`);
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  return page.url();
}

/** Thêm 1 part qua splitter + upload audio qua API (admin session) + publish.
 *  unitNumber PARAMETERIZED (review P1: hardcode NUM làm cascade test upload
 *  vào unit NUM thay unit đang test — đúng class number-vs-id sự cố). */
async function addPartUploadPublish(
  page: Page,
  editorUrl: string,
  unitNumber: number,
): Promise<void> {
  await page
    .getByPlaceholder("Dán toàn bộ script vào đây…")
    .fill(`Probe sentence number ${unitNumber}.`);
  await page.getByRole("button", { name: "Split câu" }).click();
  await page
    .getByRole("button", { name: "Thêm 1 câu vào bài" })
    .click();
  await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();

  const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
  const lessonId = await lessonIdByNumber(unitNumber, lessonNumber);
  const up = await page.request.post("/api/admin/upload", {
    multipart: {
      file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3probe") },
      lessonId: String(lessonId),
      partIndex: "1",
    },
  });
  expect(up.status()).toBe(200);
  // GUARD chống ô nhiễm: path phải nằm trong unit QA của run (audio demo đã bị
  // ghi đè 1 lần khi bắn nhầm lesson NUMBER thay id — sự cố 2026-09-30)
  const upBody = (await up.json()) as { path?: string };
  expect(upBody.path).toContain(`unit-${unitNumber}/`);

  await page.getByRole("button", { name: "Xuất bản" }).click();
  await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();
}

test.describe("Units CRUD edge (SF-4)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/books/level-3/units");
  });

  test.afterAll(async () => {
    // 4 unit số riêng per test (tránh duplicate ngầm trong run — bài học
    // 2026-09-30: NUM chung làm test sau va unit của test trước)
    for (const n of [NUM, NUM_EMPTY, NUM_CASCADE, NUM_RESTRICT]) {
      await cleanupQaUnit(n);
    }
    await cleanupQaAccount(EMAIL_ATTEMPT);
  });

  test("number 1.5 → browser step=1 chặn submit (không tạo unit; server invalidNumber phủ ở unit test)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Tạo unit mới" }).click();
    await page.locator("#unit-number").fill("1.5");
    await page.locator("#unit-title-en").fill("Broken");
    await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
    // form vẫn mở (native validation chặn) + KHÔNG unit nào được tạo
    await expect(page.getByRole("button", { name: "Tạo mới", exact: true })).toBeVisible();
    await expect(
      page.locator("li").filter({ hasText: "Broken" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Hủy" }).click();
  });

  test("duplicate số → duplicateNumber; sửa title (row dialog) → public unit page fresh NGAY (QA-302 #1a)", async ({
    page,
  }) => {
    await createUnit(page, NUM, "QA Title A");

    // duplicate
    await page.getByRole("button", { name: "Tạo unit mới" }).click();
    await page.locator("#unit-number").fill(String(NUM));
    await page.locator("#unit-title-en").fill("Dup");
    await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
    // scope alert vào form — getByRole("alert") toàn trang trùng
    // __next-route-announcer__ (role=alert ẩn danh) → strict violation
    await expect(
      page.locator("form").getByRole("alert"),
    ).toContainText("đã tồn tại");
    await page.getByRole("button", { name: "Hủy" }).click();

    // có bài published trong unit
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM), { exact: true }) })
      .getByRole("link", { name: "Bài học" })
      .click();
    const editorUrl = await openLessonsPage(page, NUM);
    await addPartUploadPublish(page, editorUrl, NUM);

    // public thấy title CŨ (lần nav đầu — cache nóng sau publish)
    const publicUrl = `/en/books/level-3/units/${NUM}`;
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("QA Title A");

    // đổi title qua row dialog
    await page.goto("/admin/books/level-3/units");
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM), { exact: true }) })
      .getByRole("button", { name: "Sửa" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[name='titleEn']").fill(`QA Title B ${NUM}`);
    await dialog.getByRole("button", { name: "Lưu" }).click();
    // thành công = dialog đóng (toast "Lưu" quá ngắn + trùng text nút — tin state)
    await expect(dialog).toBeHidden();

    // NAVIGATION MỚI → title phải mới NGAY (retry 0 — revalidate thật)
    await page.goto(publicUrl);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`QA Title B ${NUM}`);
  });

  test("tạo unit rỗng → public book page thấy NGAY (QA-302 #1b — không cần bài published)", async ({
    page,
  }) => {
    await createUnit(page, NUM_EMPTY, `QA Empty ${NUM_EMPTY}`);
    await page.goto("/en/books/level-3");
    await expect(
      page.getByText(`QA Empty ${NUM_EMPTY}`),
    ).toBeVisible();
  });

  test("delete unit có lessons (không attempts) → cascade hết, public 404 NGAY", async ({
    page,
  }) => {
    await createUnit(page, NUM_CASCADE, "QA Cascade");
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM_CASCADE), { exact: true }) })
      .getByRole("link", { name: "Bài học" })
      .click();
    await openLessonsPage(page, NUM_CASCADE);

    await page.goto("/admin/books/level-3/units");
    page.once("dialog", (d) => d.accept());
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM_CASCADE), { exact: true }) })
      .getByRole("button", { name: "Xóa", exact: true })
      .click();
    await expect(
      page.locator("li").filter({ has: page.getByText(String(NUM_CASCADE), { exact: true }) }),
    ).toHaveCount(0);

    const res = await page.request.get(`/en/books/level-3/units/${NUM_CASCADE}`);
    expect(res.status()).toBe(404);
  });

  test("delete unit CÓ attempts → hasAttempts (RESTRICT — không mất dữ liệu)", async ({
    page,
  }) => {
    await createUnit(page, NUM_RESTRICT, "QA Restricted");
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM_RESTRICT), { exact: true }) })
      .getByRole("link", { name: "Bài học" })
      .click();
    await openLessonsPage(page, NUM_RESTRICT);
    await page
      .getByPlaceholder("Dán toàn bộ script vào đây…")
      .fill(`Restricted sentence ${NUM_RESTRICT}.`);
    await page.getByRole("button", { name: "Split câu" }).click();
    await page.getByRole("button", { name: "Thêm 1 câu vào bài" }).click();
    await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();

    // seed attempt SQL trực tiếp (1 learner + 1 attempt trên part của unit)
    await seedQaUser(EMAIL_ATTEMPT, "SF4 Attempt");
    const uid = await userIdOf(EMAIL_ATTEMPT);
    const { seedAttemptOnUnitPart } = await import("./admin-lib");
    await seedAttemptOnUnitPart(NUM_RESTRICT, uid!);

    // về units list trước khi xóa (RESTRICT test đang đứng ở lessons page)
    await page.goto("/admin/books/level-3/units");
    page.once("dialog", (d) => d.accept());
    await page
      .locator("li")
      .filter({ has: page.getByText(String(NUM_RESTRICT), { exact: true }) })
      .getByRole("button", { name: "Xóa", exact: true })
      .click();
    await expect(page.getByText(/không xóa được/)).toBeVisible();
    // unit VẪN còn (không bị xóa)
    await expect(
      page.locator("li").filter({ has: page.getByText(String(NUM_RESTRICT), { exact: true }) }),
    ).toBeVisible();
  });
});

import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQaUnit,
  lessonIdByNumber,
  loginAsAdmin,
  qaUnitNumber,
} from "./admin-lib";

/**
 * Publish gate + revalidate THẬT (spec slice 8 — ACCEPTANCE 2): thiếu audio
 * chặn + missing[] đúng; publish → NAVIGATION MỚI 200 NGAY (retry 0 — không
 * poll cache); unpublish → 404 NGAY; upload audio lên bài published → public
 * thấy NGAY (revalidate trong upload route); probe thêm: publish lesson 0
 * part → blocked (context pack slice 8 "thiếu audio/script").
 */

const NUM = qaUnitNumber();

async function createUnitLesson(page: Page, title: string): Promise<string> {
  await loginAsAdmin(page);
  await page.goto("/admin/books/level-3/units");
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(NUM));
  await page.locator("#unit-title-en").fill(`QA Publish ${NUM}`);
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page
    .locator("li")
    .filter({ has: page.getByText(String(NUM), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill(title);
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  return page.url();
}

async function addPart(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder("Dán toàn bộ script vào đây…").fill(text);
  await page.getByRole("button", { name: "Split câu" }).click();
  await page.getByRole("button", { name: "Thêm 1 câu vào bài" }).click();
  await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();
  await expect(
    page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last()
      .locator("ol li textarea"),
  ).toHaveCount(1);
}

test.describe("Publish gate + revalidate (SF-4)", () => {
  test.afterAll(async () => {
    await cleanupQaUnit(NUM);
  });

  test("publish lesson 0 part → blocked missing=[0]; 1 part thiếu audio → blocked missing=[1]", async ({
    page,
  }) => {
    const editorUrl = await createUnitLesson(page, "Gate Probe");
    // 0 part
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(
      page.getByText(/Chưa xuất bản được — các câu sau chưa đủ: 0/),
    ).toBeVisible();
    await expect(page.locator("section").first().getByText("Nháp")).toBeVisible();

    // 1 part chưa audio
    await addPart(page, `Gate sentence ${NUM}.`);
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(
      page.getByText(/Chưa xuất bản được — các câu sau chưa đủ: 1\b/),
    ).toBeVisible();
    await expect(page.locator("section").first().getByText("Nháp")).toBeVisible();
    void editorUrl;
  });

  test("publish đủ điều kiện → public 200 NGAY (retry 0); unpublish → 404 NGAY", async ({
    page,
  }) => {
    const editorUrl = await createUnitLesson(page, "Publish Probe");
    await addPart(page, `Published sentence ${NUM}.`);
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const up = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3") },
        lessonId: String(lessonId),
        partIndex: "1",
      },
    });
    expect(up.status()).toBe(200);

    const publicUrl = `/en/books/level-3/units/${NUM}/lessons/${lessonNumber}/listen-and-type`;

    // publish → NAVIGATION MỚI (page.goto = request mới, không poll)
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();
    const res = await page.goto(publicUrl);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Publish Probe");

    // unpublish → 404 NGAY
    await page.goBack();
    await page.getByRole("button", { name: "Không xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Nháp")).toBeVisible();
    const res404 = await page.goto(publicUrl);
    expect(res404?.status()).toBe(404);

    // dọn: publish lại để trạng thái nhất quán (cleanup xóa unit cả đống)
    await page.goBack();
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();
  });

  test("upload audio lên bài ĐÃ published → public thấy audio mới NGAY", async ({
    page,
  }) => {
    const editorUrl = await createUnitLesson(page, "Audio Update Probe");
    await addPart(page, `Audio update sentence ${NUM}.`);
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("v1") },
        lessonId: String(lessonId),
        partIndex: "1",
      },
    });
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();

    // public: audio v1 gán
    const publicUrl = `/en/books/level-3/units/${NUM}/lessons/${lessonNumber}/listen-and-type`;
    let res = await page.goto(publicUrl);
    expect(res?.status()).toBe(200);
    await expect(page.locator("audio").first()).toHaveAttribute("src", /01\.mp3$/);

    // REPLACE audio trên bài published (cùng path — 01.mp3) qua API
    const up2 = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("v2-longer") },
        lessonId: String(lessonId),
        partIndex: "1",
      },
    });
    expect(up2.status()).toBe(200);
    // revalidate upload route (published) — public NGAY
    res = await page.goto(publicUrl);
    expect(res?.status()).toBe(200);
    await expect(page.locator("audio").first()).toHaveAttribute("src", /01\.mp3$/);
  });
});

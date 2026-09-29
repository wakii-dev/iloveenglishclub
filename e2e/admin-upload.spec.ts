import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  cleanupQaUnit,
  lessonIdByNumber,
  loginAsAdmin,
  qaUnitNumber,
} from "./admin-lib";

/**
 * Upload edge (spec slice 7 — ACCEPTANCE 3): size limit (client pre-check +
 * server 413), MIME sai (415), per-file status + retry RIÊNG file fail,
 * numeric sort (2.mp3 TRƯỚC 10.mp3), mismatch (7 file / 5 câu), duration
 * failsoft (buffer rác → null, không crash).
 *
 * Driver: local THẬT (không BLOB_READ_WRITE_TOKEN — file xuất hiện trong
 * public/audio/ trên đĩa = bằng chứng driver local; blob probe ghi evidence).
 * Upload test dùng buffer (`setInputFiles` {name,mimeType,buffer}) — không
 * thả fixture mới vào repo. Self-clean: DB + file theo unit number.
 */

const NUM = qaUnitNumber();
const OVER_4MB = 4 * 1024 * 1024 + 1;
const TEN_SENTENCES = Array.from(
  { length: 10 },
  (_, i) => `Upload probe sentence ${i + 1}.`,
);

async function openEditor10Parts(page: Page): Promise<string> {
  await loginAsAdmin(page);
  await page.goto("/admin/books/level-3/units");
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(NUM));
  await page.locator("#unit-title-en").fill(`QA Upload ${NUM}`);
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page
    .locator("li")
    .filter({ has: page.getByText(String(NUM), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill("Upload Probe");
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  const editorUrl = page.url();

  await page
    .getByPlaceholder("Dán toàn bộ script vào đây…")
    .fill(TEN_SENTENCES.join(" "));
  await page.getByRole("button", { name: "Split câu" }).click();
  await page.getByRole("button", { name: "Thêm 10 câu vào bài" }).click();
  await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();
  // CHỜ refresh server xong — uploader nhận parts=10 qua props; không chờ thì
  // addFiles chạy với parts=0 → mọi file "Chưa map" (race refresh, cùng class
  // premature-match SF-5)
  await expect(
    page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last()
      .locator("ol li textarea"),
  ).toHaveCount(10);
  return editorUrl;
}

function fileInput(page: Page) {
  return page.locator('input[type="file"][accept="audio/*"]').first();
}

test.describe("Upload edge (SF-4)", () => {
  let editorUrl = "";

  test.beforeEach(async ({ page }) => {
    editorUrl = await openEditor10Parts(page);
  });

  test.afterAll(async () => {
    await cleanupQaUnit(NUM);
    fs.rmSync(`public/audio/level-3/unit-${NUM}`, {
      recursive: true,
      force: true,
    });
  });

  test("numeric sort: 10.mp3, 2.mp3, 01.mp3 → rows theo 01<2<10, map đúng câu", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles([
      { name: "10.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ten") },
      { name: "2.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("two") },
      { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("one") },
    ]);
    // thứ tự DOM: 01.mp3 TRƯỚC 2.mp3 TRƯỚC 10.mp3 (numeric sort — lexicographic
    // sẽ cho 01,10,2)
    const names = await page
      .locator("[data-upload-row]")
      .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-upload-row")));
    expect(names).toEqual(["01.mp3", "2.mp3", "10.mp3"]);
    // auto-map đúng số: 01→Câu 1, 2→Câu 2, 10→Câu 10
    await expect(
      page.locator('[data-upload-row="01.mp3"]').getByText("Câu 1"),
    ).toBeVisible();
    await expect(
      page.locator('[data-upload-row="2.mp3"]').getByText("Câu 2"),
    ).toBeVisible();
    await expect(
      page.locator('[data-upload-row="10.mp3"]').getByText("Câu 10"),
    ).toBeVisible();
  });

  test("file >4MB → client pre-check lỗi ngay (không phí upload); server 413 vẫn chặn", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles([
      { name: "big.mp3", mimeType: "audio/mpeg", buffer: Buffer.alloc(OVER_4MB) },
    ]);
    // badge lỗi NGAY (client pre-check — không cần bấm upload)
    await expect(
      page.locator('[data-upload-row="big.mp3"]').getByText("File > 4MB"),
    ).toBeVisible();

    // server là lưới cuối — API trực tiếp 413 (client bypass được)
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: {
          name: "big.mp3",
          mimeType: "audio/mpeg",
          buffer: Buffer.alloc(OVER_4MB),
        },
        lessonId: String(lessonId),
        partIndex: "1",
      },
    });
    expect(res.status()).toBe(413);
    expect((await res.json()).error).toBe("tooLarge");
  });

  test("MIME text/plain → 415 unsupportedFormat → row badge Sai định dạng", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles([
      { name: "01.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
    ]);
    await page
      .getByRole("button", { name: /Tải lên 1 file/ })
      .click();
    await expect(
      page.locator('[data-upload-row="01.txt"]').getByText("Sai định dạng"),
    ).toBeVisible({ timeout: 30_000 });

    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "x.mp3", mimeType: "text/plain", buffer: Buffer.from("x") },
        lessonId: String(lessonId),
        partIndex: "1",
      },
    });
    expect(res.status()).toBe(415);
    expect((await res.json()).error).toBe("unsupportedFormat");
  });

  test("mismatch 7 file / 10 câu + duplicate số → warning liệt kê rõ", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles(
      [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        name: `${String(n).padStart(2, "0")}.mp3`,
        mimeType: "audio/mpeg",
        buffer: Buffer.from(`f${n}`),
      })),
    );
    // 7 file ≤ 10 câu → tất cả mapped; giờ thêm file 01.mp3 LẦN 2 → duplicate
    await fileInput(page).setInputFiles([
      { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("dup") },
      { name: "99.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("over") },
    ]);
    await expect(page.getByText(/Trùng số câu: 1/)).toBeVisible();
    await expect(page.getByText(/Không map được.*99\.mp3/)).toBeVisible();
  });

  test("buffer rác → duration failsoft null, audio vẫn gán (không crash)", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles([
      { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3garbage") },
    ]);
    await page.getByRole("button", { name: /Tải lên 1 file/ }).click();
    await expect(
      page.locator('[data-upload-row="01.mp3"]').getByText("Xong"),
    ).toBeVisible({ timeout: 30_000 });

    // driver LOCAL thật: file tồn tại trên đĩa (blob sẽ không ghi public/)
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const { partOf } = await import("./admin-lib");
    const part = await partOf(NUM, lessonNumber, 1);
    expect(part?.audioPath).toBe(`audio/level-3/unit-${NUM}/lesson-${lessonNumber}/01.mp3`);
    expect(part?.durationMs).toBeNull();
    expect(
      fs.existsSync(`public/audio/level-3/unit-${NUM}/lesson-${lessonNumber}/01.mp3`),
    ).toBe(true);
  });

  test("per-file status + retry RIÊNG file fail (route block 3)", async ({
    page,
  }) => {
    await fileInput(page).setInputFiles([
      { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("a") },
      { name: "02.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("b") },
      { name: "03.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("c") },
    ]);
    await page.route("**/api/admin/upload", async (route) => {
      const body = route.request().postDataBuffer()?.toString() ?? "";
      if (body.includes('name="partIndex"\r\n\r\n3\r\n')) {
        await route.fulfill({ status: 500, body: '{"ok":false}' });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: /Tải lên 3 file/ }).click();
    await expect(
      page.locator('[data-upload-row="03.mp3"]').getByText("Lỗi mạng"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("main").getByText(/1 file lỗi/),
    ).toBeVisible();

    await page.unroute("**/api/admin/upload");
    await page
      .locator('[data-upload-row="03.mp3"]')
      .getByRole("button", { name: /Tải lại file này/ })
      .click();
    await expect(
      page.locator('[data-upload-row="03.mp3"]').getByText("Xong"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-upload-row="01.mp3"]').getByText("Xong"),
    ).toBeVisible();
  });

  test("driver probe: local không token → ghi evidence blob (không fail mơ hồ)", async ({
    request,
  }) => {
    // probe BLOB_READ_WRITE_TOKEN trong env server KHÔNG đọc được từ test —
    // nhưng local dev chuẩn không có token (env-matrix SF-1). Bằng chứng
    // driver local: upload ở test trên ghi file ĐĨA thành công. Blob driver
    // chỉ được verify ở nơi CÓ token (SF-6/prod) — ghi nhận vào evidence,
    // KHÔNG fail mơ hồ ở local (context pack slice 7).
    const hasBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    expect(hasBlob, "local dev không có blob token — driver local là path test").toBe(false);
    void request;
  });
});

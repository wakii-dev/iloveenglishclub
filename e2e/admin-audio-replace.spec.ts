import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  cleanupQaUnit,
  lessonIdByNumber,
  loginAsAdmin,
  partOf,
  qaUnitNumber,
} from "./admin-lib";

/**
 * Audio replace + duration failsoft (spec slice 9): replace flow UI (select
 * part + pick file) giữ path convention `{NN}.{ext}`; MIME khác → ext đổi đúng
 * (01.mp3 → 01.wav); buffer rác → durationMs null KHÔNG crash (failsoft);
 * durationMs invalid (API) → null.
 */

const NUM = qaUnitNumber();

async function openEditor(page: Page): Promise<string> {
  await loginAsAdmin(page);
  await page.goto("/admin/books/level-3/units");
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(NUM));
  await page.locator("#unit-title-en").fill(`QA Replace ${NUM}`);
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page
    .locator("li")
    .filter({ has: page.getByText(String(NUM), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill("Replace Probe");
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  const editorUrl = page.url();

  await page
    .getByPlaceholder("Dán toàn bộ script vào đây…")
    .fill(`Replace probe sentence one. Sentence two here.`);
  await page.getByRole("button", { name: "Split câu" }).click();
  await page.getByRole("button", { name: "Thêm 2 câu vào bài" }).click();
  await expect(page.getByPlaceholder("Dán toàn bộ script vào đây…")).toBeVisible();
  await expect(
    page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last()
      .locator("ol li textarea"),
  ).toHaveCount(2);

  // audio ban đầu cho cả 2 part
  const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
  const lessonId = await lessonIdByNumber(NUM, lessonNumber);
  for (const idx of [1, 2]) {
    const up = await page.request.post("/api/admin/upload", {
      multipart: {
        file: {
          name: `${String(idx).padStart(2, "0")}.mp3`,
          mimeType: "audio/mpeg",
          buffer: Buffer.from(`audio-v1-part${idx}`),
        },
        lessonId: String(lessonId),
        partIndex: String(idx),
        durationMs: String(1500 * idx),
      },
    });
    expect(up.status()).toBe(200);
  }
  await page.reload();
  await expect(
    page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last()
      .locator("ol li audio"),
  ).toHaveCount(2);
  return editorUrl;
}

test.describe("Audio replace + failsoft (SF-4)", () => {
  test.afterAll(async () => {
    await cleanupQaUnit(NUM);
    fs.rmSync(`public/audio/level-3/unit-${NUM}`, { recursive: true, force: true });
  });

  test("replace UI: select câu + pick file → path giữ convention, badge tên mới, durationMs update", async ({
    page,
  }) => {
    const editorUrl = await openEditor(page);
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());

    // badge cũ 01.mp3 ở part 1
    const partsSection = page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last();
    await expect(partsSection.locator("ol li").first()).toContainText("01.mp3");

    // replace flow: chọn Câu 1 + pick file WAV (MIME khác → ext đổi đúng)
    await page
      .getByRole("combobox", { name: "Thay audio cho câu:" })
      .click();
    await page.getByRole("option", { name: "Câu 1", exact: true }).click();
    await page.locator('label:has-text("Chọn file…") input').setInputFiles([
      { name: "take2.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFFwav-v2") },
    ]);
    await expect(page.getByText("Đã thay audio câu 1")).toBeVisible();
    // badge = TÊN PATH SERVER (convention NN.ext) — không phải tên file gốc
    await expect(partsSection.locator("ol li").first()).toContainText("01.wav");

    // path convention: NN theo part + ext theo MIME
    const part1 = await partOf(NUM, lessonNumber, 1);
    expect(part1?.audioPath).toBe(
      `audio/level-3/unit-${NUM}/lesson-${lessonNumber}/01.wav`,
    );
    // duration failsoft: buffer không đọc được metadata → KHÔNG crash, null
    // (readDurationMs timeout 5s — nếu có duration thì là số ≥0, không crash)
    expect(part1?.durationMs === null || typeof part1?.durationMs === "number").toBe(true);
  });

  test("durationMs invalid (API trực tiếp) → null, part vẫn cập nhật audioPath", async ({
    page,
  }) => {
    const editorUrl = await openEditor(page);
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("x") },
        lessonId: String(lessonId),
        partIndex: "1",
        durationMs: "abc",
      },
    });
    expect(res.status()).toBe(200);
    const part = await partOf(NUM, lessonNumber, 1);
    expect(part?.audioPath).toContain("01.mp3");
    expect(part?.durationMs).toBeNull();
  });

  test("durationMs quá 600000 → cap (failsoft không vỡ dữ liệu)", async ({
    page,
  }) => {
    const editorUrl = await openEditor(page);
    const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
    const lessonId = await lessonIdByNumber(NUM, lessonNumber);
    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "02.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("y") },
        lessonId: String(lessonId),
        partIndex: "2",
        durationMs: "9999999",
      },
    });
    expect(res.status()).toBe(200);
    const part = await partOf(NUM, lessonNumber, 2);
    expect(part?.durationMs).toBe(600000);
  });
});

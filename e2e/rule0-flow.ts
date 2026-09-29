import fs from "node:fs";
import { chromium } from "@playwright/test";
import dotenv from "dotenv";
import { cleanupQaUnit } from "./admin-lib.ts";

/**
 * Rule 0 — FLOW trọn (task 11): login admin → tạo unit → lesson → script →
 * split → upload audio → publish → THẤY bài trên site public. Screenshot mỗi
 * màn (VISUAL tier — pixel thật, coordinator tự Read ảnh). DOM tier = các
 * expect() trong script. Cleanup cuối (unit 950 + file đĩa).
 * Chạy: node e2e/rule0-flow.ts (dev server 3010 phải đang sống)
 */

dotenv.config({ path: ".env.local" });
const SHOT_DIR = "docs/superpowers/evidence/sf-4-admin-cms-qa/screens";
const BASE = "http://localhost:3010";
const NUM = 950;

async function main(): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "vi-VN" });
  const shot = (name: string) =>
    page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
  const results: string[] = [];
  const ok = (label: string, pass: boolean) => {
    results.push(`${pass ? "PASS" : "FAIL"} ${label}`);
    if (!pass) throw new Error(`Rule 0 FAIL: ${label}`);
  };

  // 1. login admin (inline — loginAs dùng relative URL cho test context)
  await page.goto(`${BASE}/vi/login?next=/admin`);
  ok("login page renders (vi)", await page.getByRole("button", { name: "Đăng nhập" }).isVisible());
  await shot("1-login");
  await page.locator("#email").fill(process.env.ADMIN_EMAIL ?? "admin@ilec.dev");
  await page.locator("#password").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((u) => u.pathname === "/admin");
  ok("login → /admin", new URL(page.url()).pathname === "/admin");

  // 2. dashboard DOM
  await page.getByRole("heading", { name: "Tổng quan" }).waitFor();
  ok("dashboard heading Tổng quan", true);
  await shot("2-dashboard");

  // 3. tạo unit
  await page.goto(`${BASE}/admin/books/level-3/units`);
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(NUM));
  await page.locator("#unit-title-en").fill("Rule0 Flow Unit");
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page
    .locator("li")
    .filter({ has: page.getByText(String(NUM), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await page.waitForURL(new RegExp(`/units/${NUM}/lessons$`));
  ok("unit tạo + vào lessons", page.url().includes(`/units/${NUM}/lessons`));

  // 4. tạo lesson → editor
  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill("Rule0 Flow Lesson");
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  const editorUrl = page.url();
  ok("lesson tạo → editor", /lessons\/\d+$/.test(page.url()));

  // 5. script → split (3 câu) → thêm
  await page
    .getByPlaceholder("Dán toàn bộ script vào đây…")
    .fill("First rule0 sentence. Second sentence here. Third and final.");
  await page.getByRole("button", { name: "Split câu" }).click();
  await page.getByText("3 câu — sửa tay nếu cần").waitFor();
  await shot("3-split-preview");
  await page.getByRole("button", { name: "Thêm 3 câu vào bài" }).click();
  await page.getByPlaceholder("Dán toàn bộ script vào đây…").waitFor();
  // chờ refresh server — uploader props.parts cập nhật (không thì auto-map
  // chạy với parts=0 → không có nút Tải lên — cùng race admin-upload)
  await page
    .locator("section", { hasText: "Câu hỏi của bài" })
    .last()
    .locator("ol li textarea")
    .first()
    .waitFor();
  ok("3 parts thêm vào bài", true);

  // 6. upload 3 file audio (UI) → Xong hết
  await page
    .locator('input[type="file"][accept="audio/*"]')
    .first()
    .setInputFiles([1, 2, 3].map((n) => ({
      name: `${String(n).padStart(2, "0")}.mp3`,
      mimeType: "audio/mpeg",
      buffer: Buffer.from(`rule0-audio-${n}`),
    })));
  await page.getByRole("button", { name: /Tải lên 3 file/ }).click();
  for (const n of ["01.mp3", "02.mp3", "03.mp3"]) {
    await page
      .locator(`[data-upload-row="${n}"]`)
      .getByText("Xong")
      .waitFor({ timeout: 30_000 });
  }
  await page.getByText("Mọi câu đã có audio ✓").waitFor();
  ok("3 file upload Xong + allMapped", true);
  await shot("4-uploaded");

  // 7. publish → public THẤY NGAY
  await page.getByRole("button", { name: "Xuất bản" }).click();
  await page.locator("section").first().getByText("Đã xuất bản").waitFor();
  await shot("5-published");
  const lessonNumber = Number(new URL(editorUrl).pathname.split("/").pop());
  const res = await page.goto(
    `${BASE}/en/books/level-3/units/${NUM}/lessons/${lessonNumber}/listen-and-type`,
  );
  ok(`public ${res?.status()} (revalidate thật)`, res?.status() === 200);
  await page.getByRole("heading", { level: 1 }).waitFor();
  const h1 = await page.getByRole("heading", { level: 1 }).innerText();
  ok(`public thấy bài (h1="${h1}")`, h1.includes("Rule0 Flow Lesson"));
  const audio = page.locator("audio").first();
  ok("audio wire src .mp3", (await audio.getAttribute("src"))?.endsWith(".mp3") === true);
  await shot("6-public-lesson");

  // cleanup
  await cleanupQaUnit(NUM);
  fs.rmSync(`public/audio/level-3/unit-${NUM}`, { recursive: true, force: true });

  await browser.close();
  console.log(results.join("\n"));
  console.log("RULE0-FLOW: ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

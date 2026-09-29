import { expect, test, type Page } from "@playwright/test";

/**
 * E2E Admin CMS (SF-5) — ACCEPTANCE context pack sf-5.md:
 * 1. login admin → dashboard; guest/non-admin bị chặn (UI + upload API)
 * 2. tạo unit → lesson → paste script → split đúng N dòng, sửa tay được
 * 3. 5 file 01..05.mp3 → map đúng thứ tự số; file fail → retry riêng
 * 4. thiếu audio chặn publish có thông báo; đủ → public placeholder thấy bài
 * 5. part có attempts → xóa disabled + tooltip RESTRICT; unpublish OK
 *
 * Prereq: local Postgres `ilec` migrated+seeded (npm run db:migrate &&
 * npm run db:seed) + ADMIN_EMAIL/ADMIN_PASSWORD trong .env.local
 * (globalSetup tự tạo admin + attempt fixture). Chạy: npm run test:e2e.
 */

const UNIT_NUMBER = 90 + (Date.now() % 50); // random-per-run chống trùng khi re-run
const SCRIPT = [
  "The sun rises early in the morning.",
  "My sister plays tennis after school.",
  "We eat dinner together at seven.",
  "He reads a book before bedtime.",
  "They walk to the park on Sunday.",
];
const FIXTURES = [
  "e2e/fixtures/01.mp3",
  "e2e/fixtures/02.mp3",
  "e2e/fixtures/03.mp3",
  "e2e/fixtures/04.mp3",
  "e2e/fixtures/05.mp3",
];

async function loginAsAdmin(page: Page): Promise<void> {
  // /vi/login — UI tiếng Việt (đúng selector); after login redirect /admin.
  // waitForURL theo PATHNAME — glob "**/admin" false-positive với
  // "/vi/login?next=/admin" (URL kết "/admin") → race trước khi cookie kịp set.
  await page.goto("/vi/login?next=/admin");
  await page.locator("#email").fill(process.env.ADMIN_EMAIL ?? "admin@ilec.dev");
  await page.locator("#password").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL((u) => u.pathname === "/admin");
}

/** Tạo unit mới + lesson mới → trả editor URL. Phải đang ở trang units. */
async function createUnitAndLesson(
  page: Page,
  lessonTitle: string,
): Promise<string> {
  await page.getByRole("button", { name: "Tạo unit mới" }).click();
  await page.locator("#unit-number").fill(String(UNIT_NUMBER));
  await page.locator("#unit-title-en").fill("E2E Unit");
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await expect(page.getByText("E2E Unit").first()).toBeVisible();

  await page
    .locator("li", { hasText: "E2E Unit" })
    // SF-8: neo theo số unit — locator text-không alone khớp unit E2E của
    // run TRƯỚC còn tồn trong DB (strict violation khi ≥2; DB luôn dơ chéo run)
    .filter({ has: page.getByText(String(UNIT_NUMBER), { exact: true }) })
    .getByRole("link", { name: "Bài học" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/units/${UNIT_NUMBER}/lessons$`));

  await page.getByRole("button", { name: "Tạo bài học" }).click();
  await page.locator("#lesson-title-en").fill(lessonTitle);
  await page.locator("#lesson-vocab").click();
  await page.getByRole("option", { name: "A2", exact: true }).click();
  await page.getByRole("button", { name: "Tạo mới", exact: true }).click();
  await page.waitForURL(/\/lessons\/\d+$/);
  return page.url();
}

/** Thêm script vào lesson qua splitter (split + add). */
async function addScript(page: Page, sentences: string[]): Promise<void> {
  await page
    .getByPlaceholder("Dán toàn bộ script vào đây…")
    .fill(sentences.join(" "));
  await page.getByRole("button", { name: "Split câu" }).click();
  await expect(page.getByText(/câu — sửa tay/)).toBeVisible();
  await page
    .getByRole("button", { name: `Thêm ${sentences.length} câu vào bài` })
    .click();
  // Post-condition DUY NHẤT đáng tin: splitter RESET về trạng thái đóng
  // (placeholder hiện lại). Count `ol li textarea` không đủ — splitter
  // preview cũng là ol+textarea và match premature khi action chưa xong
  // (upload sẽ chạy với parts=0 → auto-map chết).
  await expect(
    page.getByPlaceholder("Dán toàn bộ script vào đây…"),
  ).toBeVisible();
  // parts editor (scoped) hiện đúng N dòng
  await expect(
    page
      .locator("section", { hasText: "Câu hỏi của bài" })
      .last()
      .locator("ol li textarea"),
  ).toHaveCount(sentences.length);
}

test.describe("Admin CMS E2E", () => {
  test("guest gọi thẳng upload API → 401; learner thường (non-admin) → 403", async ({
    page,
    request,
  }) => {
    const guest = await request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("x") },
        lessonId: "1",
        partIndex: "1",
      },
    });
    expect(guest.status()).toBe(401);

    // learner thường (seed bởi seed-attempts) — đăng nhập UI để có session
    await page.goto("/vi/login");
    await page.locator("#email").fill("e2e-learner@example.com");
    await page.locator("#password").fill("e2e-learner-pass");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const res = await page.request.post("/api/admin/upload", {
      multipart: {
        file: { name: "01.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("x") },
        lessonId: "1",
        partIndex: "1",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("guest vào /admin → redirect login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });

  test("flow chính: dashboard → unit → lesson → split → upload → publish → public thấy bài", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // ACCEPTANCE 1 — dashboard số liệu
    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
    await expect(page.getByText("Theo sách")).toBeVisible();

    await page.goto("/admin/books/level-3/units");
    const editorUrl = await createUnitAndLesson(page, "E2E Morning routine");

    // ACCEPTANCE 2 — paste → split đúng 5 dòng
    await addScript(page, SCRIPT);

    // ACCEPTANCE 3 — 5 file 01..05.mp3 auto-map đúng thứ tự số
    const fileInput = page
      .locator('input[type="file"][accept="audio/*"]')
      .first();
    await fileInput.setInputFiles(FIXTURES);
    for (let i = 0; i < 5; i++) {
      await expect(
        page.locator(`[data-upload-row="0${i + 1}.mp3"]`).getByText(`Câu ${i + 1}`),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: /Tải lên 5 file/ }).click();
    await expect(
      page.locator('[data-upload-row="01.mp3"]').getByText("Xong"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Mọi câu đã có audio ✓")).toBeVisible();
    // mapping đúng THỨ TỰ: part n hiển thị file 0n.mp3 (badge tên file)
    const partsSection = page.locator("section", { hasText: "Câu hỏi của bài" }).last();
    for (let i = 0; i < 5; i++) {
      await expect(
        partsSection.locator("ol li").nth(i).getByText(`0${i + 1}.mp3`),
      ).toBeVisible();
    }

    // ACCEPTANCE 4 — publish → public placeholder thấy bài + audio phát được
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(
      page.locator("section").first().getByText("Đã xuất bản"),
    ).toBeVisible();
    const lessonNumber = editorUrl.match(/lessons\/(\d+)$/)![1]!;
    const res = await page.goto(
      `/en/books/level-3/units/${UNIT_NUMBER}/lessons/${lessonNumber}/listen-and-type`,
    );
    expect(res?.status()).toBeLessThan(400); // revalidateTag đã fire — không 404
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "E2E Morning routine",
    );
    // SF-8: native <audio> của player SF-4 cố tình `hidden` (custom UI điều
    // khiển) — assertion cũ `toBeVisible` viết thời placeholder SF-2 (audio
    // controls visible), stale sau merge SF-4+SF-5. Intent thật: audio được
    // wire src đúng trên trang public.
    const audio = page.locator("audio").first();
    await expect(audio).toBeAttached();
    await expect(audio).toHaveAttribute("src", /\.mp3$/);
  });

  test("thiếu audio → publish chặn kèm thông báo liệt kê số câu", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/books/level-3/units");
    await createUnitAndLesson(page, "E2E Blocked lesson");

    await addScript(page, ["Only one sentence here."]);

    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(
      page.getByText(/Chưa xuất bản được — các câu sau chưa đủ: 1/),
    ).toBeVisible();
    // trạng thái vẫn Nháp
    await expect(page.locator("section").first().getByText("Nháp")).toBeVisible();
  });

  test("file 3 fail → per-file error → retry RIÊNG file 3 → xong", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/books/level-3/units");
    await createUnitAndLesson(page, "E2E Retry lesson");

    await addScript(page, SCRIPT);

    const fileInput = page
      .locator('input[type="file"][accept="audio/*"]')
      .first();
    await fileInput.setInputFiles(FIXTURES);

    // chặn ĐÚNG request của file 3 (partIndex=3) → 500
    await page.route("**/api/admin/upload", async (route) => {
      const body = route.request().postDataBuffer()?.toString() ?? "";
      if (body.includes('name="partIndex"\r\n\r\n3\r\n')) {
        await route.fulfill({ status: 500, body: '{"ok":false}' });
      } else {
        await route.continue();
      }
    });
    await page.getByRole("button", { name: /Tải lên 5 file/ }).click();
    const row3 = page.locator('[data-upload-row="03.mp3"]');
    await expect(row3.getByText("Lỗi mạng")).toBeVisible({ timeout: 30_000 });
    // SF-8: scope main — text cũng nằm trong sonner toast (strict violation
    // khi toast còn sống; race-dependent trong run cũ)
    await expect(
      page.getByRole("main").getByText(/1 file lỗi/),
    ).toBeVisible();

    // bỏ chặn → retry RIÊNG file 3 → xong; 4 file còn lại giữ Xong
    await page.unroute("**/api/admin/upload");
    await row3.getByRole("button", { name: /Tải lại file này/ }).click();
    await expect(row3.getByText("Xong")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('[data-upload-row="01.mp3"]').getByText("Xong"),
    ).toBeVisible();
    await expect(page.getByText("Mọi câu đã có audio ✓")).toBeVisible();
  });

  test("ACCEPTANCE 5: part có attempts → xóa disabled + tooltip RESTRICT; unpublish OK", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    // lesson demo L3-U1-L1 — part 1 có attempt (globalSetup seed)
    await page.goto("/admin/books/level-3/units/1/lessons/1");
    const part1 = page.locator("ol li").first();
    // SF-8: assertion cũ /1 lượt học/ digit-substring brittle VÀ match cả "0" —
    // chung (58 không match, 21 match, 0 lượt học cũng match). Intent: count ≥ 1.
    await expect(part1.getByText(/[1-9]\d* lượt học/)).toBeVisible();
    const deleteBtn = part1.getByRole("button", { name: "Xóa câu" });
    await expect(deleteBtn).toBeDisabled();
    await expect(deleteBtn).toHaveAttribute("title", /không xóa được/);

    // unpublish demo → public 404 (revalidate firing) → publish lại như cũ
    await page.getByRole("button", { name: "Không xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Nháp")).toBeVisible();
    const res404 = await page.goto(
      "/en/books/level-3/units/1/lessons/1/listen-and-type",
    );
    expect(res404?.status()).toBe(404);
    await page.goBack();
    await page.getByRole("button", { name: "Xuất bản" }).click();
    await expect(page.locator("section").first().getByText("Đã xuất bản")).toBeVisible();
    const res200 = await page.goto(
      "/en/books/level-3/units/1/lessons/1/listen-and-type",
    );
    expect(res200?.status()).toBeLessThan(400);
  });
});

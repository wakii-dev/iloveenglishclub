import { expect, test, type Page } from "@playwright/test";

/**
 * E2E quiz flow (story vocabulary-module SF-4 t-4.4): đăng ký user →
 * /books/level-4/quiz thấy đề 10 câu → trả lời đủ 3 loại (trắc nghiệm chọn
 * ngay, điền từ submit form, ghép nghĩa select đủ 5 cặp) → màn tổng kết
 * đúng/tổng + % → "Làm lại" nhận đề mới → điểm persist (top-users mục Quiz
 * scores có tên). i18n vi/en; chưa đăng nhập → redirect login kèm ?next.
 * Fixture qa-quiz-* (20 từ, book level-4) seed/tidy qua globalSetup/teardown;
 * bảng thiếu → globalSetup fail có hướng dẫn (không giả lập DB).
 */

function qaEmail(tag: string): string {
  return `qa-quiz-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern review-flow.spec.ts) → trả email. */
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

/** Trả lời 1 câu hiện tại theo loại (đồng bộ qua dòng tiến độ Question N/10). */
async function answerCurrentQuestion(page: Page, index: number): Promise<void> {
  await expect(page.getByText(`Question ${index}/10`)).toBeVisible();
  const mcGroup = page.getByRole("group", { name: "Meaning options" });
  const fillInput = page.getByLabel(/Type the word meaning:/);
  const firstSelect = page.getByRole("combobox").first();
  if (await mcGroup.isVisible()) {
    await mcGroup.getByRole("button").first().click();
    return;
  }
  if (await fillInput.isVisible()) {
    await fillInput.fill("qa-typed-answer");
    await page.getByRole("button", { name: "Continue" }).click();
    return;
  }
  // ghép nghĩa: câu 5 và 10 — đủ 5 combobox
  await expect(firstSelect).toBeVisible();
  const selects = page.getByRole("combobox");
  await expect(selects).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await selects.nth(i).selectOption({ index: 1 });
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

test.describe("Quiz flow (vocabulary SF-4)", () => {
  test.setTimeout(120_000);

  test("EN: đề 10 câu → trả lời 3 loại → tổng kết % → làm lại → điểm lên top-users", async ({
    page,
  }) => {
    await registerUser(page, "QA Quiz EN");

    await page.goto("/en/books/level-4/quiz");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Vocabulary quiz",
    );
    await expect(page.getByText("Question 1/10")).toBeVisible();

    for (let q = 1; q <= 10; q++) {
      await answerCurrentQuestion(page, q);
    }

    // Màn tổng kết: đúng/tổng + % (tổng = 18 đáp án chấm: 8 câu đơn + 2 ghép
    // × 5 cặp — quiz.test.ts pin, KHÔNG phải 10 slot)
    await expect(
      page.getByRole("heading", { name: "Quiz results" }),
    ).toBeVisible();
    await expect(page.getByText(/You got \d+\/\d+ correct/)).toBeVisible();
    await expect(page.getByText(/\d+% correct/)).toBeVisible();

    // Làm lại → reload nhận đề xáo mới, về câu 1
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Question 1/10")).toBeVisible();

    // Điểm đã lưu quiz_attempts → bảng xếp hạng mục Quiz scores có tên
    await page.goto("/en/top-users");
    const quizSection = page.locator('[aria-labelledby="quiz-heading"]');
    await expect(quizSection).toBeVisible();
    await expect(quizSection.getByText("QA Quiz EN")).toBeVisible();
  });

  test("VI: nhãn i18n — đề 10 câu, điền từ và ghép nghĩa đều nhãn tiếng Việt", async ({
    page,
  }) => {
    await registerUser(page, "QA Quiz VI");

    await page.goto("/vi/books/level-4/quiz");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Kiểm tra từ vựng",
    );
    await expect(page.getByText("Câu 1/10")).toBeVisible();

    // Câu 1 trắc nghiệm → chọn → câu 2 điền từ
    await expect(page.getByText("Chọn nghĩa đúng của:")).toBeVisible();
    await page
      .getByRole("group", { name: "Các phương án nghĩa" })
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByText("Câu 2/10")).toBeVisible();
    await expect(page.getByText("Điền từ tiếng Anh có nghĩa:")).toBeVisible();
    await page
      .getByLabel(/Nhập từ có nghĩa:/)
      .fill("qa-typed-answer");
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    // Câu 3-4 (trắc nghiệm + điền từ) → câu 5 ghép nghĩa 5 combobox
    for (let q = 3; q <= 4; q++) {
      await expect(page.getByText(`Câu ${q}/10`)).toBeVisible();
      const fillInput = page.getByLabel(/Nhập từ có nghĩa:/);
      if (await fillInput.isVisible()) {
        await fillInput.fill("qa-typed-answer");
        await page.getByRole("button", { name: "Tiếp tục" }).click();
      } else {
        await page
          .getByRole("group", { name: "Các phương án nghĩa" })
          .getByRole("button")
          .first()
          .click();
      }
    }
    await expect(page.getByText("Câu 5/10")).toBeVisible();
    await expect(page.getByText("Ghép mỗi từ với nghĩa đúng:")).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(5);
  });

  test("chưa đăng nhập → redirect login kèm ?next", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/en/books/level-4/quiz");
    await expect(page).toHaveURL(
      /\/en\/login\?next=(%2F|\/)en(%2F|\/)books(%2F|\/)level-4(%2F|\/)quiz/,
    );
  });
});

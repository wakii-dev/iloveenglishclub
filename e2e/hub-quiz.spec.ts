import { expect, test, type Page } from "@playwright/test";

/**
 * E2E tab Kiểm tra tổng (story vocabulary-hub SF-3 t-3.3): picker chọn phạm
 * vi (Tất cả / từng sách / nhiều sách) → đề sinh theo scope → trả lời đủ 3
 * loại (trắc nghiệm, điền từ, ghép nghĩa — answerCurrent tổng quát, không
 * phụ thuộc số câu) → màn tổng kết → điểm persist quiz_attempts (book_id
 * NULL cho scope all/multi) → top-users có tên. Guest → redirect login kèm
 * ?next (cả tab Ôn tập). Bảng thiếu / book_id chưa nullable → globalSetup
 * fail có hướng dẫn (e2e/vocabulary-hub-quiz-fixture.ts).
 */

function qaEmail(tag: string): string {
  return `qa-hubquiz-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern hub-library.spec.ts) → trả email. */
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

/**
 * Trả lời 1 câu hiện tại theo loại (đáp án tùy ý — server chấm). Trước khi
 * phân loại đợi TỔNG KẾT hoặc 1 trong 3 loại câu xuất hiện (advance giữa các
 * câu + POST nộp bài đều async — tránh đoán loại câu quá sớm). Câu CUỐI advance
 * → POST chấm async: form câu cuối vẫn render trong lúc "Grading…" — đợi chấm
 * xong trước khi phân loại, không thì đọc nhầm thành câu mới và click Continue
 * bị pending disable đến hết timeout (trace 04/10: đề 3 câu nhưng fill 4 lần).
 */
async function answerCurrent(page: Page): Promise<boolean> {
  const results = page.getByRole("heading", { name: "Quiz results" });
  const fillInput = page.getByLabel(/Type the word meaning:/);
  const mcGroup = page.getByRole("group", { name: "Meaning options" });
  await expect(
    results
      .or(fillInput)
      .or(mcGroup)
      .or(page.getByRole("combobox").first()),
  ).toBeVisible();
  if (await results.isVisible()) return true;

  // Guard pending (runner hiện "Grading…" khi POST): chấm xong = results
  // render cùng commit → re-check kết quả trước khi phân loại câu
  await expect(page.getByText("Grading…")).toBeHidden();
  if (await results.isVisible()) return true;

  if (await fillInput.isVisible()) {
    await fillInput.fill("qa-typed-answer");
    await page.getByRole("button", { name: "Continue" }).click();
    return false;
  }
  if (await mcGroup.isVisible()) {
    await mcGroup.getByRole("button").first().click();
    return false;
  }
  // ghép nghĩa: 5 combobox (placeholder "…" là option index 0)
  const selects = page.getByRole("combobox");
  await expect(selects).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await selects.nth(i).selectOption({ index: 1 });
  }
  await page.getByRole("button", { name: "Continue" }).click();
  return false;
}

test.describe("Vocabulary hub quiz (SF-3)", () => {
  test.setTimeout(120_000);

  test("EN: picker mặc định Tất cả → trả lời đủ → tổng kết % → điểm lên top-users", async ({
    page,
  }) => {
    await registerUser(page, "QA Hub Quiz EN");

    await page.goto("/en/vocabulary?tab=quiz");
    await expect(
      page.getByRole("heading", { name: "Choose quiz scope" }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "All words" }),
    ).toBeChecked();

    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.waitForURL(/tab=quiz&scope=all/);
    await expect(page.getByText(/Question 1\/\d+/)).toBeVisible();

    // đi hết đề (đáp án tùy ý — server chấm); đề 10 câu chuẩn, pool nhỏ thu
    // ngắn cũng qua được loop
    for (let i = 0; i < 40; i++) {
      if (await answerCurrent(page)) break;
    }
    await expect(
      page.getByRole("heading", { name: "Quiz results" }),
    ).toBeVisible();
    await expect(page.getByText(/You got \d+\/\d+ correct/)).toBeVisible();

    // điểm đã persist (scope all → quiz_attempts.book_id NULL) → top-users
    await page.goto("/en/top-users");
    const quizSection = page.locator('[aria-labelledby="quiz-heading"]');
    await expect(quizSection.getByText("QA Hub Quiz EN")).toBeVisible();
  });

  test("EN: scope=book trong hub + scope=multi&books → đề render, Đổi phạm vi về picker", async ({
    page,
  }) => {
    await registerUser(page, "QA Hub Quiz Scope");

    // book id 1 = level-1 (seed cố định) — có qa-hub-charlie
    await page.goto("/en/vocabulary?tab=quiz&scope=book&book=1");
    await expect(page.getByText(/Question 1\/\d+/)).toBeVisible();

    // multi: id lạ chỉ góp phần rỗng — pool vẫn hợp lệ từ book 1
    await page.goto("/en/vocabulary?tab=quiz&scope=multi&books=1,999");
    await expect(page.getByText(/Question 1\/\d+/)).toBeVisible();

    await page.getByRole("link", { name: "Change scope" }).click();
    await expect(page).toHaveURL(/\/en\/vocabulary\?tab=quiz$/);
    await expect(
      page.getByRole("heading", { name: "Choose quiz scope" }),
    ).toBeVisible();
  });

  test("EN: picker — từng sách qua Select, nhiều sách qua checkbox, Bắt đầu đẩy đúng URL", async ({
    page,
  }) => {
    await registerUser(page, "QA Hub Quiz Picker");
    await page.goto("/en/vocabulary?tab=quiz");

    const start = page.getByRole("button", { name: "Start", exact: true });

    // từng sách: disable khi chưa chọn, chọn xong mở được đề
    await page.getByRole("radio", { name: "Single book" }).check();
    await expect(start).toBeDisabled();
    await page.getByRole("combobox", { name: "Choose a book" }).click();
    // level-1 seed titleEn "Level 1 — Starter" (pattern hub-library.spec)
    await page
      .getByRole("option", { name: "Level 1 — Starter", exact: true })
      .click();
    await expect(start).toBeEnabled();
    await start.click();
    await page.waitForURL(/tab=quiz&scope=book&book=\d+/);

    // nhiều sách: cần ≥1 checkbox
    await page.goto("/en/vocabulary?tab=quiz");
    await page.getByRole("radio", { name: "Multiple books" }).check();
    await expect(
      page.getByRole("button", { name: "Start", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox").first().check();
    await page
      .getByRole("button", { name: "Start", exact: true })
      .click();
    await page.waitForURL(/tab=quiz&scope=multi&books=\d+/);
  });

  test("guest: tab Kiểm tra và Ôn tập đều redirect login kèm ?next", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/en/vocabulary?tab=quiz");
    await expect(page).toHaveURL(
      /\/en\/login\?next=(%2F|\/)en(%2F|\/)vocabulary/,
    );
    await page.goto("/en/vocabulary?tab=review");
    await expect(page).toHaveURL(
      /\/en\/login\?next=(%2F|\/)en(%2F|\/)vocabulary/,
    );
  });
});

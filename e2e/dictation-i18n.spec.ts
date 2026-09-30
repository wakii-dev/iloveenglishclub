import { expect, test } from "@playwright/test";

/**
 * Task 9 — i18n en/vi TRÊN LESSON THẬT (context pack slice #8): copy đúng
 * messages/{en,vi}/lesson.json theo từng vùng UI (start-gate, player, input,
 * actions, diff notes, results, banner) — đối chiếu chuỗi gốc trong file
 * messages (locale vi deep-link + en đối chiếu). Baseline i18n-switch.spec
 * phủ switch mid-lesson — spec này phủ PARITY COPY trên flow thật.
 */

const VI = "/vi/books/level-3/units/1/lessons/1/listen-and-type";
const EN = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const S1 = "I play football with my friends every Saturday.";
const S1_WRONG = "I play football with my friend every Saturday.";

test.describe("Dictation i18n (en/vi lesson thật)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test("VI deep-link: start-gate + player + input + actions copy đúng messages/vi", async ({
    page,
  }) => {
    await page.goto(VI, { waitUntil: "domcontentloaded" });
    // Start-gate
    await expect(page.getByText(/Nghe và gõ lại chính xác/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Bắt đầu" })).toBeVisible();
    await expect(page.getByText(/4 câu/)).toBeVisible(); // facts
    await expect(page.getByText(/\+40 XP tối đa/)).toBeVisible();

    await page.getByRole("button", { name: "Bắt đầu" }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    // Tabs + part label + player
    await expect(page.getByRole("button", { name: "Chính tả" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Toàn bộ bài đọc" })).toBeVisible();
    await expect(page.getByText("Phần 1 / 4").first()).toBeVisible(); // tabs + PartNav cùng chuỗi ở vi
    await expect(
      page.getByRole("button", { name: "Tạm dừng" }),
    ).toBeVisible(); // audio đang phát → aria pause vi
    await expect(page.getByRole("slider")).toHaveAttribute(
      "aria-label",
      "Phát",
    );
    // Input + actions
    await expect(page.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Gõ những gì bạn nghe được...",
    );
    await expect(page.getByRole("button", { name: "Bỏ qua" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lộ một từ" })).toBeVisible(); // aria-label hint vi
    await expect(page.getByRole("button", { name: "Kiểm tra" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Khắt khe" })).toBeVisible(); // relaxed off vi
    await expect(page.getByText("chưa lưu")).toBeVisible(); // XP chip guest
    // PartNav
    await expect(page.getByRole("button", { name: "Phần trước" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Phần sau" })).toBeDisabled();
  });

  test("VI flow: check sai → diff note strict vi; sửa → 'Chính xác!'; skip hết → Results vi đầy đủ", async ({
    page,
  }) => {
    await page.goto(VI, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    const ta = page.getByRole("textbox");

    await ta.fill(S1_WRONG);
    await ta.press("Enter");
    await expect(
      page.getByText(
        /Xanh — đúng\. Đỏ — từ của bạn, kèm từ đúng phía trên\. Hoa\/thường và dấu câu được tính\./,
      ),
    ).toBeVisible(); // note STRICT vi

    await ta.fill(S1);
    await ta.press("Enter");
    await expect(page.getByText("Chính xác!")).toBeVisible();
    await page.getByRole("button", { name: "Câu tiếp" }).click();

    // Skip nốt 3 part → results vi
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Bỏ qua câu này" }).click();
    }
    await expect(page.getByText("Tuyệt vời!")).toBeVisible();
    await expect(page.getByText("1 hoàn thành · 3 bỏ qua")).toBeVisible();
    await expect(page.getByText("+9 XP nhận được")).toBeVisible(); // XP bank check đầu 7/8 (sai 1 từ) = 9
    await expect(page.getByText("Streak sắp ra mắt")).toBeVisible();
    await expect(page.getByText("Đăng nhập để lưu điểm")).toBeVisible();
    await expect(page.getByRole("button", { name: "Làm lại" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Bài tiếp theo/ })).toBeVisible();
  });

  test("EN đối chiếu cùng flow: copy en khác vi đúng khoá tương ứng", async ({
    page,
  }) => {
    await page.goto(EN, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Start part/i })).toBeVisible();
    await page.getByRole("button", { name: /Start part/i }).click();
    await expect(page.getByRole("textbox")).toHaveAttribute(
      "placeholder",
      "Type what you hear...",
    );
    await expect(page.getByRole("button", { name: "Strict" })).toBeVisible();

    const ta = page.getByRole("textbox");
    await ta.fill(S1_WRONG);
    await ta.press("Enter");
    await expect(
      page.getByText(
        /Green — correct\. Red — your word, with the correct one on top\. Capitalisation and punctuation count\./,
      ),
    ).toBeVisible(); // note STRICT en — khác vi đúng messages

    await ta.fill(S1);
    await ta.press("Enter");
    await expect(page.getByText("Exactly right!")).toBeVisible();
  });

  test("Relaxed toggle vi: 'Tha thứ ×0.5' + description tooltip; note đổi sang relaxed vi", async ({
    page,
  }) => {
    await page.goto(VI, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Bắt đầu" }).click();
    const relaxed = page.getByRole("button", { name: "Khắt khe" });
    await relaxed.click();
    await expect(page.getByRole("button", { name: "Tha thứ ×0.5" })).toBeVisible();
    await expect(
      page.getByText(/Hoa\/thường và dấu câu được bỏ qua\./),
    ).not.toBeVisible(); // note chỉ hiện SAU check đầu — chưa check
    await page.getByRole("textbox").fill("i play football with my friends every saturday");
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(/Hoa\/thường và dấu câu được bỏ qua\./),
    ).toBeVisible(); // note relaxed vi
    await expect(page.getByText("Chính xác!")).toBeVisible(); // relaxed matched
  });
});

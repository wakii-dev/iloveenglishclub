import { expect, test } from "@playwright/test";

/**
 * E2E SF-4 — guest happy path (context pack #13: guest + ephemeral + banner).
 * Bài demo: /en/books/level-3/units/1/lessons/1/listen-and-type — 4 câu,
 * audio tone 3.5s/câu (seed SF-2, audio commit trong public/audio).
 *
 * Flow: Start → player → gõ sai → Enter check (diff đỏ + chip đúng) → sửa →
 * Enter check lại → "Exactly right!" → Enter next → hint XP ×0.8 → skip
 * không cộng progress → part-nav không nhảy tới part pending → Results
 * (accuracy/XP) + banner "đăng nhập để lưu" + Bài tiếp theo.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const SENT_1 = "I play football with my friends every Saturday.";
const SENT_2 = "She likes reading books in the library.";

const START = /start part|bắt đầu/i;

test.describe("Dictation guest happy path", () => {
  test.beforeEach(async ({ page: p }) => {
    await p.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(p.getByRole("button", { name: START })).toBeVisible();
  });

  test("Start gate → audio phát câu 1 → gõ sai → check diff → sửa → đúng → next", async ({
    page: p,
  }) => {
    await p.getByRole("button", { name: START }).click();

    // DICTATION: player pill + textarea + Skip/Check + Part 1/4
    await expect(p.getByText(/Part 1 of 4|Phần 1 \/ 4/i)).toBeVisible();
    await expect(p.getByRole("slider")).toBeVisible();
    await expect(p.getByRole("textbox")).toBeVisible();

    // gõ sai 1 từ ("friend" thay "friends")
    await p.getByRole("textbox").fill(
      "I play football with my friend every Saturday",
    );
    await p.keyboard.press("Enter"); // check ĐẦU qua Enter
    await expect(p.getByText(/exactly right|chính xác/i)).toHaveCount(0);

    // diff: từ sai đỏ gạch + chip từ đúng phía trên
    await expect(p.locator("span.line-through").first()).toBeVisible();
    await expect(p.locator("i.not-italic").first()).toHaveText("friends");

    // sửa + check LẠI (Enter — không giới hạn)
    await p.getByRole("textbox").fill(SENT_1);
    await p.keyboard.press("Enter");
    await expect(p.getByText(/exactly right|chính xác/i)).toBeVisible();

    // Enter = next → Part 2
    await p.keyboard.press("Enter");
    await expect(p.getByText(/Part 2 of 4|Phần 2 \/ 4/i)).toBeVisible();
  });

  test("Hint lộ 1 từ + XP ×0.8 hiển thị; chip XP guest có 'not saved'", async ({
    page: p,
  }) => {
    await p.getByRole("button", { name: START }).click();
    await expect(p.getByText(/Part 1 of 4/i)).toBeVisible();

    // hint TRƯỚC check đầu — lộ từ đầu tiên (chip trong HintStrip)
    await p.getByRole("button", { name: /reveal one word|lộ một từ/i }).click();
    const hintStrip = p.locator("div.bg-accent");
    await expect(hintStrip).toBeVisible();
    await expect(hintStrip.locator("span.rounded-full").first()).toHaveText(
      "I",
    );

    // check ĐÚNG với hint → XP = 10×1×0.8 = 8 (chip guest "not saved")
    await p.getByRole("textbox").fill(SENT_1);
    await p.keyboard.press("Enter");
    await expect(p.getByText(/exactly right|chính xác/i)).toBeVisible();
    const xpChip = p.locator("span", { hasText: /\+\s?8 XP/ }).first();
    await expect(xpChip).toBeVisible();
    await expect(xpChip.getByText(/not saved|chưa lưu/i)).toBeVisible();
  });

  test("Skip không cộng progress; part-nav không nhảy tới part pending", async ({
    page: p,
  }) => {
    await p.getByRole("button", { name: START }).click();
    await expect(p.getByText(/Part 1 of 4/i)).toBeVisible();

    // Part 1 done
    await p.getByRole("textbox").fill(SENT_1);
    await p.keyboard.press("Enter");
    await p.keyboard.press("Enter"); // next
    await expect(p.getByText(/Part 2 of 4/i)).toBeVisible();

    // Part 2 skip → progress vẫn 1/4 = 25% (skip không tính)
    await p.getByRole("button", { name: /skip this sentence|bỏ qua câu/i }).click();
    await expect(p.getByText(/Part 3 of 4/i)).toBeVisible();
    await expect(p.locator("[role=progressbar] span").first()).toHaveAttribute(
      "style",
      /25%/,
    );

    // ‹ về part 2 (review, readOnly) — › thuần điều hướng về part 3
    await p.getByRole("button", { name: /previous part|phần trước/i }).click();
    await expect(p.getByText(/Part 2 \/ 4/i)).toBeVisible();
    await expect(p.getByRole("textbox")).toHaveAttribute("readonly", "");
    await p.getByRole("button", { name: /next part|phần sau/i }).click();
    await expect(p.getByText(/Part 3 \/ 4/i)).toBeVisible();

    // › disabled khi part đang pending (không nhảy tới)
    await expect(
      p.getByRole("button", { name: /next part|phần sau/i }),
    ).toBeDisabled();
  });

  test("Paste bị chặn; mobile attrs off", async ({ page: p }) => {
    await p.getByRole("button", { name: START }).click();
    const ta = p.getByRole("textbox");
    await expect(ta).toBeVisible();

    // attrs mobile accuracy (ACCEPTANCE #5)
    await expect(ta).toHaveAttribute("autocapitalize", "none");
    await expect(ta).toHaveAttribute("autocorrect", "off");
    await expect(ta).not.toHaveAttribute("spellcheck", "true");

    // paste → preventDefault + note
    await ta.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "pasted text");
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(p.getByText(/pasting is disabled|không được dán/i)).toBeVisible();
    await expect(ta).toHaveValue("");
  });

  test("Hết bài → Results accuracy/XP + banner đăng nhập + transcript mở", async ({
    page: p,
  }) => {
    await p.getByRole("button", { name: START }).click();

    // Part 1: đúng có hint (XP 8)
    await p.getByRole("button", { name: /reveal one word|lộ một từ/i }).click();
    await p.getByRole("textbox").fill(SENT_1);
    await p.keyboard.press("Enter");
    await p.keyboard.press("Enter");

    // Part 2: đúng không hint (XP 10)
    await expect(p.getByText(/Part 2 of 4/i)).toBeVisible();
    await p.getByRole("textbox").fill(SENT_2);
    await p.keyboard.press("Enter");
    await p.keyboard.press("Enter");

    // Part 3: check sai rồi skip — XP banked giữ (accuracy 6/7 → 9)
    await expect(p.getByText(/Part 3 of 4/i)).toBeVisible();
    await p.getByRole("textbox").fill("We watch a movie at the weekend.");
    await p.keyboard.press("Enter");
    await p.getByRole("button", { name: /skip this sentence|bỏ qua câu/i }).click();

    // Part 4: skip luôn
    await expect(p.getByText(/Part 4 of 4/i)).toBeVisible();
    await p.getByRole("button", { name: /skip this sentence|bỏ qua câu/i }).click();

    // RESULTS (§5.7/§5.8): accuracy TB part done = 100%; XP = 8+10+9 = 27
    await expect(p.getByText(/great job|tuyệt vời/i)).toBeVisible();
    await expect(p.getByText(/100%/)).toBeVisible();
    await expect(p.getByText(/\+\s?27 XP earned/i)).toBeVisible();
    await expect(p.getByText(/not saved|chưa lưu/i).first()).toBeVisible();
    await expect(
      p.getByText(/log in to save|đăng nhập để lưu/i),
    ).toBeVisible();
    await expect(p.getByText(/streak coming soon|streak sắp ra mắt/i)).toBeVisible();

    // Try again → quay lại dictation Part 1
    await p.getByRole("button", { name: /try again|làm lại/i }).click();
    await expect(p.getByText(/Part 1 of 4/i)).toBeVisible();
  });

  test("Full transcript tab: done hiện, pending blur + lock; Play all", async ({
    page: p,
  }) => {
    await p.getByRole("button", { name: START }).click();
    await expect(p.getByText(/Part 1 of 4/i)).toBeVisible();

    await p
      .getByRole("button", { name: /full transcript|toàn bộ bài đọc/i })
      .click();
    // câu 1-2 (chưa xong) blur; list có 4 hàng; lock-note hiện
    await expect(p.getByText(/finish the part|hoàn thành phần/i)).toBeVisible();
    await expect(
      p.getByRole("list", { name: /full transcript|toàn bộ bài đọc/i }).locator("li"),
    ).toHaveCount(4);

    // Play all → highlight câu đầu (audio element riêng)
    await p.getByRole("button", { name: /play all|phát tất cả/i }).click();
    await expect(
      p
        .getByRole("list", { name: /full transcript|toàn bộ bài đọc/i })
        .locator("li.text-primary")
        .first(),
    ).toBeVisible();
  });
});

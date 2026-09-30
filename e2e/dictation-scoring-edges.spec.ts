import { expect, test, type Page } from "@playwright/test";
import { diffWords, computeXp } from "../src/lib/dictation/diff";
import { SCORING_LESSON_URL, SCORING_PARTS } from "./sf2-db";

/**
 * Task 2 — Scoring edge TRÊN UI THẬT (context pack slice #1): input bẩn
 * (apostrophe, dấu câu biên, hoa/thường, unicode NFC/NFD, trống, thừa token)
 * đối chiếu truth `src/lib/dictation/diff.ts` (unit 100% branch). ORACLE =
 * import diffWords/computeXp trực tiếp — expected tính từ truth, không đoán
 * tay: UI hiển thị LỆCH truth = finding QA-1xx.
 *
 * Fixture lesson 99 (sf2-db.ts — câu edge seed demo không có); guest-only →
 * teardown xóa sạch. Chạy trong config sf2 (port 3210, DB ilec_sf2).
 */

const START = /start part|bắt đầu/i;

test.describe("Dictation scoring edges (UI vs diff.ts truth)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000); // compile lạnh route lesson lần đầu

  async function startLesson(page: Page, url = SCORING_LESSON_URL): Promise<void> {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
  }

  /** Skip (n-1) part để tới part n (skip pre-check hợp lệ — attempts 0). */
  async function skipToPart(page: Page, n: number): Promise<void> {
    for (let i = 2; i <= n; i++) {
      await page
        .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
        .click();
      await expect(page.getByText(new RegExp(`Part ${i} of 5|Phần ${i} \\/ 5`))).toBeVisible();
    }
  }

  async function check(page: Page, typed: string): Promise<void> {
    await page.getByRole("textbox").fill(typed);
    await page.keyboard.press("Enter");
  }

  /**
   * UI phải khớp truth: banner "Exactly right!" ⟺ allCorrect · số từ đỏ
   * (line-through) = wrong+missing+extra · số chip từ đúng = wrong+missing
   * (extra không có transcriptToken → không chip).
   */
  async function expectUiMatchesTruth(
    page: Page,
    transcript: string,
    typed: string,
    mode: "strict" | "relaxed",
  ): Promise<void> {
    const truth = diffWords(transcript, typed, mode);
    const banner = page.getByText(/exactly right|chính xác/i);
    if (truth.allCorrect) await expect(banner).toBeVisible();
    else await expect(banner).toHaveCount(0);

    const reds = page.locator("span.line-through");
    const expectedReds = truth.wrongCount + truth.missingCount + truth.extraCount;
    if (expectedReds === 0) await expect(reds).toHaveCount(0);
    else await expect(reds).toHaveCount(expectedReds);

    const chips = page.locator("span.line-through i");
    const expectedChips = truth.wrongCount + truth.missingCount;
    if (expectedChips === 0) await expect(chips).toHaveCount(0);
    else await expect(chips).toHaveCount(expectedChips);
  }

  async function expectXpChip(page: Page, xp: number): Promise<void> {
    await expect(
      page.locator("span", { hasText: new RegExp(`\\+\\s?${xp} XP`) }).first(),
    ).toBeVisible();
  }

  test("QA apostrophe: transcript ’ cong, gõ ' thẳng — strict matched (tokenize normalize)", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[0]; // "Don’t stop believing — …"
    const typedStraight = "Don't stop believing — hold on to that feeling.";
    // Self-check oracle: truth bảo điều này (nếu sai → fixture/truth sai trước)
    expect(diffWords(transcript, typedStraight, "strict").allCorrect).toBe(true);

    await startLesson(page);
    await check(page, typedStraight);
    await expectUiMatchesTruth(page, transcript, typedStraight, "strict");
    await expectXpChip(page, computeXp({ accuracy: 1, usedHint: false, relaxed: false, isFirstAttempt: true }));
  });

  test("Strict dấu câu biên: 'here' thiếu '!' → wrong + chip; sang relaxed → matched; XP giữ mức check ĐẦU", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[4]; // "Punctuation matters here!"
    const typed = "Punctuation matters here";
    const truthStrict = diffWords(transcript, typed, "strict");
    expect(truthStrict.allCorrect).toBe(false);
    const xpFirst = computeXp({
      accuracy: truthStrict.matchedCount / truthStrict.transcriptWordCount,
      usedHint: false,
      relaxed: false,
      isFirstAttempt: true,
    });

    await startLesson(page);
    await skipToPart(page, 5);
    await check(page, typed);
    await expectUiMatchesTruth(page, transcript, typed, "strict");
    await expectXpChip(page, xpFirst);

    // Toggle relaxed giữa chừng → check lại CÙNG input → matched (by-design
    // mode đổi giữa part — QA registry BY-DESIGN, hành vi phải KHỚP spec)
    await page.getByRole("button", { name: /^relaxed|strict/i }).click();
    await expect(
      page.getByText(/capitalisation and punctuation are forgiven|hoa\/thường và dấu câu được bỏ qua/i),
    ).toBeVisible(); // note chuyển sang relaxed
    await check(page, typed);
    await expectUiMatchesTruth(page, transcript, typed, "relaxed");
    await expectXpChip(page, xpFirst); // XP BANK từ check đầu — không cộng lại
  });

  test("Relaxed: hoa/thường + dấu câu biên bỏ qua, decimal '3.5' GIỮ NGUYÊN → matched, XP ×0.5", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[1]; // "I bought 3.5 kg of apples; they were ripe."
    const typed = "i bought 3.5 kg of apples they were ripe";
    expect(diffWords(transcript, typed, "relaxed").allCorrect).toBe(true);
    expect(diffWords(transcript, typed, "strict").allCorrect).toBe(false); // strict phải sai

    await startLesson(page);
    await skipToPart(page, 2);
    await page.getByRole("button", { name: /^relaxed|strict/i }).click();
    await check(page, typed);
    await expectUiMatchesTruth(page, transcript, typed, "relaxed");
    await expectXpChip(page, 5); // round(10 × 1 × 0.5)
  });

  test("Unicode NFC vs NFD: gõ decomposed nhìn GIỐNG composed → truth WRONG cả 2 mode; UI phải khớp truth", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[2]; // NFC composed "Café naïve résumé."
    const typedNfd = transcript.normalize("NFD");
    expect(typedNfd).not.toBe(transcript); // khác code point, nhìn giống
    expect(diffWords(transcript, typedNfd, "strict").allCorrect).toBe(false);
    expect(diffWords(transcript, typedNfd, "relaxed").allCorrect).toBe(false);

    await startLesson(page);
    await skipToPart(page, 3);
    await check(page, typedNfd);
    await expectUiMatchesTruth(page, transcript, typedNfd, "strict");
    // XP 0 banked (accuracy 0) — sửa exact sau đó vẫn +0
    await check(page, transcript);
    await expectUiMatchesTruth(page, transcript, transcript, "strict");
    await expectXpChip(page, 0);
  });

  test("Extra tokens anti-gaming: accuracy 100% nhưng KHÔNG 'Exactly right!'; extra đỏ KHÔNG chip; XP vẫn 10", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[3]; // "She said: hello there."
    const typed = "She said: hello there. my dear friend"; // giữ cả dấu chấm để 4 token đầu matched
    const truth = diffWords(transcript, typed, "strict");
    expect(truth.allCorrect).toBe(false);
    expect(truth.extraCount).toBe(3); // my/dear/friend — 3 token dư
    expect(truth.matchedCount / truth.transcriptWordCount).toBe(1);

    await startLesson(page);
    await skipToPart(page, 4);
    await check(page, typed);
    await expectUiMatchesTruth(page, transcript, typed, "strict");
    await expectXpChip(page, 10); // XP theo accuracy — extras không trừ (spec §5.5)

    // Sau check còn sai, Enter = RE-CHECK (spec §3.3) — phải bút "Next sentence"
    // (next() với allCorrect=false → part "skipped" ngầm); skip part cuối → results
    await page.getByRole("button", { name: /next sentence|câu tiếp/i }).click();
    await expect(page.getByText(/Part 5 of 5|Phần 5 \/ 5/i)).toBeVisible();
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();
    await expect(page.getByText(/great job|tuyệt vời/i)).toBeVisible();
    // Không part done → accuracy 0%; reviewWords rỗng (extras không transcriptToken)
    await expect(page.getByText(/0%/).first()).toBeVisible();
    await expect(page.getByText(/words to review|từ cần ôn/i)).toHaveCount(0);
  });

  test("Input trống: mọi từ missing (dash đỏ + chip), accuracy 0%, XP 0", async ({
    page,
  }) => {
    const transcript = SCORING_PARTS[4];
    const truth = diffWords(transcript, "", "strict");
    expect(truth.missingCount).toBe(3);

    await startLesson(page);
    await skipToPart(page, 5);
    await check(page, "");
    await expectUiMatchesTruth(page, transcript, "", "strict");
    await expectXpChip(page, 0);
    // chip đầu = token đầu transcript
    await expect(page.locator("span.line-through i").first()).toHaveText("Punctuation");
  });

  test("XP bank trên content thật (lesson demo): sai 1 từ → +9; sửa đúng → vẫn +9", async ({
    page,
  }) => {
    const transcript = "I play football with my friends every Saturday.";
    const typedWrong = "I play football with my friend every Saturday."; // đúng dấu chấm — sai ĐÚNG 1 từ (friend)
    const truth = diffWords(transcript, typedWrong, "strict");
    const xpFirst = computeXp({
      accuracy: truth.matchedCount / truth.transcriptWordCount,
      usedHint: false,
      relaxed: false,
      isFirstAttempt: true,
    });
    expect(xpFirst).toBe(9); // round(10 × 7/8)

    await startLesson(page, "/en/books/level-3/units/1/lessons/1/listen-and-type");
    await check(page, typedWrong);
    await expectXpChip(page, 9);
    await check(page, transcript);
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
    await expectXpChip(page, 9); // BANK — không thành +10
  });
});

import { expect, type Page } from "@playwright/test";
import { QA_PASSWORD, TODAY_WORDS } from "./today-fixture";

/**
 * Driver chung suite /today 3321 (daily-journey SF-3, VU-51): login UI form
 * (user seed SQL — bcrypt tĩnh) + review-session adaptive driver (pattern
 * review-upgrade.spec — nhận diện bước trên màn: type / mc / listen rồi trả
 * lời ĐÚNG; chờ advance chống click lại bước cũ — click không timeout = ăn
 * trọn test timeout).
 */

/** Đăng nhập user seed qua UI form → redirect /vi. */
export async function loginUser(page: Page, email: string): Promise<void> {
  await page.goto("/vi/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill(QA_PASSWORD);
  await page
    .locator("form")
    .getByRole("button", { name: /log in|đăng nhập/i })
    .click();
  await page.waitForURL(/\/vi$/);
}

const WORD_BY_MEANING = new Map(
  TODAY_WORDS.map((w) => [w.meaning, w.word] as const),
);

/** Chờ advance sau khi trả lời: feedback MẤT (auto-advance) hoặc summary. */
async function waitAdvanced(page: Page): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (
      await page.getByTestId("session-summary").isVisible().catch(() => false)
    ) {
      return;
    }
    const fb =
      (await page
        .getByTestId("feedback-correct")
        .isVisible()
        .catch(() => false)) ||
      (await page
        .getByTestId("feedback-wrong")
        .isVisible()
        .catch(() => false));
    if (!fb) return;
    await page.waitForTimeout(200);
  }
  throw new Error("feedback không tự mất sau 30s — advance không xảy ra");
}

/** Trả lời ĐÚNG bước hiện tại (adaptive: type / listen / mc). */
async function answerCurrent(page: Page): Promise<boolean> {
  if (await page.getByTestId("session-summary").isVisible()) return false;
  if (await page.getByTestId("type-input").isVisible()) {
    const prompt = await page.getByTestId("type-prompt").innerText();
    const meaning = prompt.replaceAll("“", "").replaceAll("”", "").trim();
    const word = WORD_BY_MEANING.get(meaning);
    if (!word) throw new Error(`prompt lạ: ${prompt}`);
    await page.getByTestId("type-input").fill(word);
    await page.getByTestId("type-input").press("Enter");
    await expect(page.getByTestId("feedback-correct")).toBeVisible({
      timeout: 30_000,
    });
    await waitAdvanced(page);
    return true;
  }
  if (await page.getByTestId("listen-replay").isVisible()) {
    // listen-first chỉ với từ CÓ audio — fixture qa-today không có audio
    throw new Error("bước listen không kỳ vọng — fixture không seed audio");
  }
  if (await page.getByTestId("option-group").isVisible()) {
    // mc: heading lộ từ → chọn option đúng nghĩa
    const word = await page
      .getByTestId("step-card")
      .getByRole("heading")
      .innerText();
    const meaning = TODAY_WORDS.find((w) => w.word === word.trim())?.meaning;
    if (!meaning) throw new Error(`mc từ lạ: ${word}`);
    await page
      .getByTestId("session-option")
      .filter({ hasText: meaning })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId("feedback-correct")).toBeVisible({
      timeout: 30_000,
    });
    await waitAdvanced(page);
    return true;
  }
  throw new Error("không nhận diện được bước hiện tại");
}

/**
 * Trả lời ĐÚNG tới KẾT THÚC phiên (summary) — mỗi từ review có ≥2 bước
 * (mc→type, buildReviewSteps): dừng sớm theo count = bỏ sót bước cuối
 * (bug đã gặp: navigated-away giữa phiên → từ cuối không POST). minWords
 * chỉ là guard số từ ĐÚNG phân biệt tối thiểu.
 */
export async function reviewCorrectly(
  page: Page,
  minWords: number,
): Promise<void> {
  let done = 0;
  for (let guard = 0; guard < 60; guard++) {
    if (
      await page.getByTestId("session-summary").isVisible().catch(() => false)
    ) {
      if (done >= minWords) return;
      throw new Error(`summary nhưng chỉ ${done}/${minWords} từ đúng`);
    }
    if (await answerCurrent(page)) done += 1;
    await page.waitForTimeout(300);
  }
  throw new Error(`review không xong sau guard — done=${done}/${minWords}`);
}

/** Trả lời ĐÚNG ĐÚNG 1 bước hiện tại (không đi tiếp — dùng khi cần cắm mốc
 * giữa phiên, vd assert dot chưa tắt giữa 2 từ). */
export async function answerOneStep(page: Page): Promise<void> {
  for (let guard = 0; guard < 10; guard++) {
    if (await page.getByTestId("session-summary").isVisible().catch(() => false)) {
      throw new Error("summary xuất hiện sớm — không còn bước để trả lời");
    }
    if (
      (await page.getByTestId("type-input").isVisible().catch(() => false)) ||
      (await page.getByTestId("option-group").isVisible().catch(() => false)) ||
      (await page.getByTestId("listen-replay").isVisible().catch(() => false))
    ) {
      if (await answerCurrent(page)) return;
    }
    await page.waitForTimeout(300);
  }
  throw new Error("không có bước nào để trả lời sau 3s");
}

import { expect, test, type Page } from "@playwright/test";
import {
  RU_BOOK_ID,
  RU_WORDS,
  countStepActivities,
  progressRow,
  seedDueProgress,
  seedExtraDueWord,
  wordIdOf,
} from "./vocabulary-review-upgrade-fixture";

/**
 * E2E review session UI (vocab-memrise SF-3, VU-40 — context pack #11,
 * migrate coverage suite 3311 nghỉ hưu): seed due rows → /me/vocabulary →
 * MC/nghe + gõ từ. Gõ đúng → +1 XP/bước + due_at SM-2 tiến; gõ sai →
 * requeue CUỐI phiên + lapses+1 + 0 XP; double-submit không cộng XP (chip
 * đứng + DB 1 row/bước); `?word=` prefill đúng 1 từ; `?scope=book` lọc.
 * Queue order DB tie (due_at bằng nhau) KHÔNG định trước → driver ADAPTIVE:
 * nhận diện bước trên màn (type-prompt / listen-replay / heading) rồi trả lời.
 */

const WORD_BY_MEANING = new Map(RU_WORDS.map((w) => [w.meaning, w.word]));
const MEANING_BY_WORD = new Map(RU_WORDS.map((w) => [w.word, w.meaning]));
const AUDIO_WORD = RU_WORDS.find((w) => w.audio !== null)!.word; // chỉ 1 từ có audio

function qaEmail(tag: string): string {
  return `qa-ru-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

async function registerUser(page: Page, tag: string): Promise<string> {
  const email = qaEmail(tag);
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(`QA RU ${tag}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  return email;
}

/** Chờ advance sau khi trả lời: feedback MẤT (auto-advance/continue) hoặc
 *  summary hiện — chống click lại option disabled của bước cũ (Playwright
 *  click không timeout = ăn trọn test timeout 300s). */
async function waitAdvanced(page: Page): Promise<void> {
  for (let i = 0; i < 150; i++) {
    if (await page.getByTestId("session-summary").isVisible().catch(() => false)) return;
    const fb =
      (await page.getByTestId("feedback-correct").isVisible().catch(() => false)) ||
      (await page.getByTestId("feedback-wrong").isVisible().catch(() => false));
    if (!fb) return;
    await page.waitForTimeout(200);
  }
  throw new Error("feedback không tự mất sau 30s — advance không xảy ra");
}

/** Trả lời ĐÚNG bước hiện tại (adaptive theo loại bước trên màn). */
async function answerCurrent(page: Page): Promise<boolean> {
  if (await page.getByTestId("session-summary").isVisible()) return false;
  console.log(
    `[drv] type=${await page.getByTestId("type-input").isVisible().catch(() => "ERR")} listen=${await page.getByTestId("listen-replay").isVisible().catch(() => "ERR")} opt=${await page.getByTestId("option-group").isVisible().catch(() => "ERR")}`,
  );
  if (await page.getByTestId("type-input").isVisible()) {
    const prompt = await page.getByTestId("type-prompt").innerText();
    const meaning = prompt.replaceAll("“", "").replaceAll("”", "").trim();
    const word = WORD_BY_MEANING.get(meaning);
    if (!word) throw new Error(`prompt lạ: ${prompt}`);
    await page.getByTestId("type-input").fill(word);
    await page.getByTestId("type-input").press("Enter");
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    await waitAdvanced(page);
    return true;
  }
  if (await page.getByTestId("listen-replay").isVisible()) {
    // listen-first chỉ xảy ra với từ CÓ audio — fixture chỉ 1 từ
    const meaning = MEANING_BY_WORD.get(AUDIO_WORD)!;
    await page
      .getByTestId("session-option")
      .filter({ hasText: meaning })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    await waitAdvanced(page);
    return true;
  }
  if (await page.getByTestId("option-group").isVisible()) {
    // mc: heading lộ từ (payload mc có word — contract learn-session.ts)
    const word = await page
      .getByTestId("step-card")
      .getByRole("heading")
      .innerText();
    const meaning = MEANING_BY_WORD.get(word.trim());
    if (!meaning) throw new Error(`mc từ lạ: ${word}`);
    await page
      .getByTestId("session-option")
      .filter({ hasText: meaning })
      .click({ timeout: 5_000 });
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    await waitAdvanced(page);
    return true;
  }
  throw new Error("không nhận diện được bước hiện tại");
}

/** Đi đến khi summary — mỗi vòng chờ màn kế HOẶC summary (auto-advance ~1s). */
async function playAll(page: Page): Promise<void> {
  for (let guard = 0; guard < 40; guard++) {
    await expect(
      page
        .getByTestId("step-card")
        .or(page.getByTestId("session-summary"))
        .first(),
    ).toBeVisible();
    if (!(await answerCurrent(page))) return;
  }
  throw new Error("phiên không kết thúc sau 40 bước");
}

test.describe("Review session UI (vocab-memrise SF-3)", () => {
  test.setTimeout(300_000);

  // Bảng chứng POST: xp từng bước (chẩn đoán XP kép)
  test.beforeEach(({ page }) => {
    page.on("response", async (res) => {
      if (
        res.url().includes("/api/vocabulary/session") &&
        res.request().method() === "POST"
      ) {
        let body = "";
        try {
          body = (await res.text()).slice(0, 200);
        } catch {
          body = "<no body>";
        }
        console.log(`[e2e] POST → ${res.status()} ${body}`);
      }
    });
  });

  test("gõ đúng 4 từ due → +4 XP (1/từ lần-đầu-ngày), DB reps tiến + due_at tương lai", async ({
    page,
  }) => {
    const email = await registerUser(page, "ok");
    await seedDueProgress(email);
    await page.goto("/en/me/vocabulary");

    await expect(page.getByText("Review vocabulary")).toBeVisible();
    await expect(page.getByText("4 words to review today")).toBeVisible();

    await playAll(page);
    // 1 XP/từ (bước đúng đầu trong ngày — mc; type +0 đã dùng quota từ)
    await expect(page.getByTestId("summary-xp")).toHaveText("+4 XP");
    await expect(page.getByTestId("summary-planted")).toHaveText("4");

    const row = await progressRow(email, "qa-ru-01");
    expect(row?.lapses).toBe(0);
    expect(row?.reps).toBe(3); // 2 + 1 (SM-2 q=4)
    expect(row!.dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  test("gõ sai type → requeue cuối phiên + lapses+1, retry vẫn tiến (tổng +4)", async ({
    page,
  }) => {
    const email = await registerUser(page, "fail");
    await seedDueProgress(email);
    await page.goto("/en/me/vocabulary");

    // Bước type ĐẦU TIÊN gặp được → trả lời SAI cố định (trước nó có thể là
    // mc/listen của từ khác — lái adaptive tới khi type hiện ra)
    for (let i = 0; i < 10; i++) {
      if (await page.getByTestId("type-input").isVisible()) break;
      if (!(await answerCurrent(page))) break;
      await expect(
        page
          .getByTestId("step-card")
          .or(page.getByTestId("session-summary"))
          .first(),
      ).toBeVisible();
    }
    await expect(page.getByTestId("type-input")).toBeVisible();
    const prompt = await page.getByTestId("type-prompt").innerText();
    const failedMeaning = prompt.replaceAll("“", "").replaceAll("”", "").trim();
    const failedWord = WORD_BY_MEANING.get(failedMeaning)!;
    await page.getByTestId("type-input").fill("totally-wrong-guess");
    await page.getByTestId("type-input").press("Enter");
    await expect(page.getByTestId("feedback-wrong")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("continue-after-wrong").click();

    await playAll(page); // phần còn lại đúng hết (gồm requeue của từ failed)
    // 3 từ thường: mc/listen +1 (type +0 — quota từ) + từ fail: retry q4 làm
    // reps 0→1 (q0 reset) → learn-complete +4 ("trồng lại nổ mầm" — engine pin)
    await expect(page.getByTestId("summary-xp")).toHaveText("+8 XP");
    await expect(page.getByTestId("summary-planted")).toHaveText("4");

    const row = await progressRow(email, failedWord);
    expect(row?.lapses).toBe(1); // q=0 lần sai đầu
    expect(row!.dueAt.getTime()).toBeGreaterThan(Date.now()); // retry q=4 tiến
  });

  test("double-submit cùng bước → chỉ 1 POST, chip không cộng 2 lần, DB 1 row/bước", async ({
    page,
  }) => {
    const email = await registerUser(page, "dbl");
    await seedDueProgress(email);
    await page.goto("/en/me/vocabulary");

    let postCount = 0;
    await page.route("**/api/vocabulary/session", async (route) => {
      postCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 400)); // mở cửa sổ double-click
      await route.continue();
    });

    // Bước MC đầu tiên: click trúng 2 lần liên tiếp trong lúc fetch chạy
    await expect(page.getByTestId("option-group")).toBeVisible();
    const word = await page
      .getByTestId("step-card")
      .getByRole("heading")
      .innerText();
    const option = page
      .getByTestId("session-option")
      .filter({ hasText: MEANING_BY_WORD.get(word.trim())! });
    await option.click();
    await option.click({ timeout: 1500 }).catch(() => {
      // click 2 bị chặn (option disabled) — client-guard hoạt động
    });
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("xp-chip")).toHaveText("+1 XP");
    await page.waitForTimeout(600); // nếu có graded trễ → chip đã phải +2
    await expect(page.getByTestId("xp-chip")).toHaveText("+1 XP");

    const postsAfterFirstStep = postCount;
    expect(postsAfterFirstStep).toBeLessThanOrEqual(1); // chỉ 1 POST cho bước này

    await playAll(page);
    await expect(page.getByTestId("summary-xp")).toHaveText("+4 XP");
    // DB: mỗi bước đúng 1 row — mc + type của từ đầu
    expect(await countStepActivities(email, word.trim(), 0)).toBe(1);
    expect(await countStepActivities(email, word.trim(), 1)).toBe(1);
  });

  test("?word= prefill → phiên đúng 1 từ đó (+1 XP lần-đầu)", async ({ page }) => {
    const email = await registerUser(page, "prefill");
    await seedDueProgress(email);
    const w3 = await wordIdOf("qa-ru-03");
    await page.goto(`/en/me/vocabulary?word=${w3}`);

    await expect(page.getByText("1 word to review today")).toBeVisible();
    // prefill queue 1 từ → pool scope-all = nghĩa chính nó (degenerate — pin
    // buildReviewSteps) → mc BỎ, phiên type-only (word ẩn, prompt nghĩa RU 3)
    await expect(page.getByTestId("type-input")).toBeVisible();
    await expect(page.getByTestId("type-prompt")).toContainText("nghĩa RU 3");

    await playAll(page);
    await expect(page.getByTestId("summary-xp")).toHaveText("+1 XP"); // type = bước đúng đầu ngày
    await expect(page.getByTestId("summary-planted")).toHaveText("1");
  });

  test("?scope=book&book= lọc khỏi từ due ngoài sách", async ({ page }) => {
    const email = await registerUser(page, "scope");
    await seedDueProgress(email);
    await seedExtraDueWord(email);
    await page.goto(`/en/me/vocabulary?scope=book&book=${RU_BOOK_ID}`);

    // 4 từ trong sách due (xtra không thuộc book bị lọc)
    await expect(page.getByText("4 words to review today")).toBeVisible();
    await playAll(page);
    await expect(page.getByTestId("summary-planted")).toHaveText("4");
  });
});

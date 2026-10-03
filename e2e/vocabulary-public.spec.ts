import { expect, test } from "@playwright/test";
import { FIXTURE_WORDS, VOCAB_BOOK_SLUG } from "./vocabulary-fixture";

/**
 * E2E vocabulary public (SF-2 t-2.3): mở trang từ vựng của book — list render
 * theo fixture, nút phát CHỈ cho từ có audio_url (t-2.2), i18n vi/en. Fixture
 * seed/tidy qua globalSetup/teardown (vocabulary-fixture.ts). Không click play
 * — audio_url fixture không trỏ file thật (xem vocabulary-fixture.ts).
 */

const [WITH_AUDIO, NO_AUDIO] = FIXTURE_WORDS;

test("vocabulary EN: list từ của book + nút phát chỉ cho từ có audio", async ({ page }) => {
  await page.goto(`/en/books/${VOCAB_BOOK_SLUG}/vocabulary`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vocabulary");
  await expect(page.getByText(WITH_AUDIO.word)).toBeVisible();
  await expect(page.getByText(NO_AUDIO.word)).toBeVisible();

  // t-2.2: từ CÓ audio → button + <audio> element; từ KHÔNG → không button
  await expect(
    page.getByRole("button", { name: new RegExp(WITH_AUDIO.word) }),
  ).toBeAttached();
  await expect(
    page.locator(`audio[src*="${WITH_AUDIO.word}"]`),
  ).toBeAttached();
  await expect(
    page.getByRole("button", { name: new RegExp(NO_AUDIO.word) }),
  ).toHaveCount(0);
  await expect(page.locator(`audio[src*="${NO_AUDIO.word}"]`)).toHaveCount(0);

  // back link về trang book
  await expect(
    page.getByRole("link", { name: "Back to book" }),
  ).toBeVisible();
});

test("vocabulary VI: nhãn i18n tiếng Việt", async ({ page }) => {
  await page.goto(`/vi/books/${VOCAB_BOOK_SLUG}/vocabulary`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Từ vựng");
  await expect(page.getByText(WITH_AUDIO.word)).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(WITH_AUDIO.word) }),
  ).toBeAttached();
  await expect(
    page.getByRole("link", { name: "Về trang sách" }),
  ).toBeVisible();
});

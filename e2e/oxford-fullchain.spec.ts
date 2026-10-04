import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";

/**
 * E2E full-chain SF-4 (VU-36, context pack §spec slice 2) — chuỗi LIỀN MẠCH:
 * attribution public → crawl-on-add (mock preview + approve REAL) → enrich
 * fill-empty REAL → public vocabulary page (attribution + audio Blob phát
 * được + IPA + example mới) → flashcards phát audio → tra từ thấy dữ liệu
 * mới + từ lạ vẫn 404 not_in_vocabulary (contract word-lookup.spec giữ
 * nguyên). 0 gọi Oxford thật (fixture DB + mock tầng browser — header config
 * playwright.oxford-fullchain.config.ts).
 *
 * Fixture: e2e/oxford-fullchain-fixture.ts — book `qa-sf4-<run>` 3 từ:
 * qasf4oak (đã enriched đầy đủ), qasf4fern (teacher-only), qasf4elm (trống +
 * crawl entry parsed → enrich fill). Audio static `audio/qa-sf4/sample.mp3`
 * (file thật trong public/ — phát được, không phụ thuộc Blob mạng).
 */
dotenv.config({ path: ".env.local" });

test.describe.configure({ mode: "serial" });

function db(): postgres.Sql {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false, max: 1 });
}

async function qaBookSlug(): Promise<string> {
  const c = db();
  const rows = await c<{ slug: string }[]>`
    select slug from books where slug like 'qa-sf4-%' limit 2`;
  await c.end();
  expect(rows, "đúng 1 fixture book QA").toHaveLength(1);
  return rows[0]!.slug;
}

const ATTR_VI = "Nguồn: Oxford Learner's Dictionaries";
const ATTR_EN = "Source: Oxford Learner's Dictionaries";

test.describe("Full-chain SF-4", () => {
  test("attribution VI: CHỈ từ source='oxford-ld' có dòng nguồn — teacher-only không", async ({
    page,
  }) => {
    const slug = await qaBookSlug();
    await page.goto(`/vi/books/${slug}/vocabulary`);

    // oak (source='oxford-ld') — CÓ dòng nguồn + audio element (relative path
    // qua resolveStoredAudioUrl)
    const oak = page.locator("li").filter({ hasText: "qasf4oak" });
    await expect(oak).toContainText(ATTR_VI);
    await expect(oak.locator("audio[src*='audio/qa-sf4/sample']")).toHaveCount(1);

    // fern (teacher-only, source null) — KHÔNG attribution, KHÔNG audio
    const fern = page.locator("li").filter({ hasText: "qasf4fern" });
    await expect(fern).toBeVisible();
    await expect(fern).not.toContainText(ATTR_VI);
    await expect(fern.locator("audio")).toHaveCount(0);
  });

  test("attribution EN + audio Blob phát được thật (play → playing state)", async ({
    page,
  }) => {
    const slug = await qaBookSlug();
    await page.goto(`/en/books/${slug}/vocabulary`);

    const oak = page.locator("li").filter({ hasText: "qasf4oak" });
    await expect(oak).toContainText(ATTR_EN);

    // bấm phát THẬT — nút chuyển sang trạng thái Dừng audio (playing=true chỉ
    // khi audio.play() resolve — file sample.mp3 thật, không phải URL chết)
    await oak.getByRole("button", { name: /Play “qasf4oak”/ }).click();
    await expect(
      oak.getByRole("button", { name: "Stop audio" }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

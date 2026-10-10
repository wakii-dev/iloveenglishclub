import { expect, test } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginAsAdmin } from "./admin-lib";
import { AUDIO_REL_PATH } from "./oxford-fullchain-fixture";

/**
 * E2E full-chain SF-4 (VU-36, context pack §spec slice 2) — chuỗi LIỀN MẠCH:
 * attribution public → crawl-on-add (cache-hit REAL API — crawl entry seeded,
 * 0 mock, 0 gọi Oxford) → enrich fill-empty REAL (dryRun counts → apply →
 * revalidate) → public vocabulary page (attribution + audio Blob phát được +
 * IPA + example mới) → flashcards hub review phát audio → tra từ thấy dữ
 * liệu mới + từ lạ vẫn 404 not_in_vocabulary (contract API; UI popover do
 * lane word-lookup.spec bảo vệ — lesson page cần published lesson, fixture
 * book QA không có).
 *
 * Fixture: e2e/oxford-fullchain-fixture.ts — book `qa-sf4-<run>` 3 từ:
 * qasf4oak (đã enriched đầy đủ), qasf4fern (teacher-only), qasf4elm (trống +
 * crawl entry parsed → enrich fill) + crawl entry qasf4maple (cache-hit cho
 * crawl-on-add, KHÔNG example → enrich counts deterministic). Audio static
 * `audio/qa-sf4/sample.mp3` (file thật trong public/ — phát được, không phụ
 * thuộc Blob mạng; pass-through y hệt blob URL thật qua resolveStoredAudioUrl).
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

  test("full-chain: crawl-on-add cache-hit REAL → approve → word vào book với audio", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000); // route /crawl/word + approve compile lạnh
    const slug = await qaBookSlug();
    await loginAsAdmin(page);
    await page.goto(`/admin/books/${slug}/vocabulary`);
    await expect(page).toHaveURL((u) => u.pathname === `/admin/books/${slug}/vocabulary`);

    // GUARD hermetic runtime (review A P2#5): abort MỌI request tới host
    // Oxford ở tầng browser — nếu regression làm preview live-fetch (đụng
    // mạng thật) test fail ngay thay vì pass âm thầm
    await page.route(/oxfordlearnersdictionaries\.com/, (route) => route.abort());

    // crawl-on-add dialog — preview cache-hit REAL (crawl entry qasf4maple seeded)
    await page.getByRole("button", { name: "Thêm từ từ Oxford" }).click();
    await expect(page.getByRole("heading", { name: "Thêm từ từ Oxford" })).toBeVisible();
    await page.locator("#crawl-add-word").fill("qasf4maple");
    await page.getByRole("button", { name: "Tra Oxford" }).click();
    await expect(page.getByText("từ kho crawl")).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("meɪpəl")).toBeVisible();
    await expect(page.getByText("Có audio phát âm")).toBeVisible();

    // meaning VI bắt buộc (teacher-owned) → duyệt
    await page.locator("#crawl-add-meaning").fill("QA cây phong");
    await page.getByRole("button", { name: "Duyệt thêm vào sách" }).click();
    await expect(
      page.getByText("Đã thêm từ “qasf4maple” vào sách."),
    ).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("kèm audio phát âm")).toBeVisible();

    // DB truth: word tạo với nguồn Oxford + audio RELATIVE từ crawl entry
    // (resolveApproveAudio DB-lookup-first — KHÔNG download, không Blob write)
    const c = db();
    const [row] = await c<{
      ipa: string | null;
      cefr: string | null;
      source: string | null;
      audioUrl: string | null;
      linked: number;
    }[]>`
      select w.ipa, w.cefr, w.source, w.audio_url as "audioUrl",
             (select count(*)::int from book_words bw
              where bw.word_id = w.id and bw.book_id = b.id) as linked
      from words w join books b on b.slug like 'qa-sf4-%'
      where w.word = 'qasf4maple'`;
    await c.end();
    expect(row).toEqual({
      ipa: "meɪpəl",
      cefr: "B1",
      source: "oxford-ld",
      audioUrl: AUDIO_REL_PATH,
      linked: 1,
    });

    await page.unroute(/oxfordlearnersdictionaries\.com/);
  });

  test("full-chain: enrich REAL fill-empty → attribution xuất hiện trên public + tra từ thấy dữ liệu mới", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(300_000);
    const slug = await qaBookSlug();
    await loginAsAdmin(page);
    await page.goto(`/admin/books/${slug}/vocabulary`);

    // enrich panel — dryRun preview counts REAL (fixture: elm fill đủ 4 field
    // + maple chỉ thiếu example nhưng entry không có example → chỉ elm fillable)
    await page.getByRole("button", { name: "Điền dữ liệu thiếu từ Oxford" }).click();
    await expect(page.getByText("Xem trước (chưa ghi dữ liệu)")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator('[data-count="candidates"]')).toHaveText("2");
    await expect(page.locator('[data-count="fillableIpa"]')).toHaveText("1");
    await expect(page.locator('[data-count="fillableExample"]')).toHaveText("1");
    await expect(page.locator('[data-count="fillableCefr"]')).toHaveText("1");
    await expect(page.locator('[data-count="fillableAudio"]')).toHaveText("1");

    // apply → report: elm được điền; oak/maple/fern bỏ qua (book 4 từ — maple
    // đã vào book ở test trước: winner nhưng không field nào fillable → skip)
    await page.getByRole("button", { name: "Chạy điền (4 từ)" }).click();
    await expect(
      page.getByText("1 từ được điền · 3 bỏ qua · 4 từ."),
    ).toBeVisible({ timeout: 180_000 });
    const elmRow = page.locator("li").filter({ hasText: "qasf4elm" }).first();
    await expect(elmRow).toContainText("IPA");
    await expect(elmRow).toContainText("Audio");

    // CONTRACT fill-empty — DB truth: elm đủ 5 field; teacher values giữ nguyên
    // (oak IPA seed 'oʊk' KHÔNG bị đụng dù crawl entry oak... không có entry oak
    // — fern không khớp entry nào → noMatch)
    const c = db();
    const [elm] = await c<{
      ipa: string | null;
      example: string | null;
      cefr: string | null;
      audioUrl: string | null;
      source: string | null;
    }[]>`
      select ipa, example, cefr, audio_url as "audioUrl", source
      from words where word = 'qasf4elm'`;
    const [oak] = await c<{ ipa: string | null; example: string | null }[]>`
      select ipa, example from words where word = 'qasf4oak'`;
    await c.end();
    expect(elm).toEqual({
      ipa: "elm",
      example: "The qasf4elm grows fast.",
      cefr: "B1",
      audioUrl: AUDIO_REL_PATH,
      source: "oxford-ld",
    });
    expect(oak).toEqual({ ipa: "oʊk", example: "The qasf4oak is tall." });

    // PUBLIC page sau revalidate: attribution XUẤT HIỆN trên elm (post-enrich
    // — bằng chứng full-chain) + IPA + example mới + audio; maple cũng có nguồn
    const vocabulary = await page.goto(`/vi/books/${slug}/vocabulary`);
    expect(vocabulary?.status()).toBe(200);
    const elmLi = page.locator("li").filter({ hasText: "qasf4elm" });
    await expect(elmLi).toContainText(ATTR_VI);
    await expect(elmLi).toContainText("The qasf4elm grows fast.");
    await expect(elmLi.locator("audio[src*='audio/qa-sf4/sample']")).toHaveCount(1);
    const mapleLi = page.locator("li").filter({ hasText: "qasf4maple" });
    await expect(mapleLi).toContainText(ATTR_VI);
    // fern (teacher-only) VẪN không attribution sau enrich
    await expect(
      page.locator("li").filter({ hasText: "qasf4fern" }),
    ).not.toContainText(ATTR_VI);

    // TRA TỪ thấy dữ liệu mới (API contract — UI popover do word-lookup.spec
    // bảo vệ): qasf4elm → 200 với IPA/example/audio MỚI sau enrich
    const bookIdRow = await (async () => {
      const c2 = db();
      const [r] = await c2<{ id: number }[]>`select id from books where slug = ${slug}`;
      await c2.end();
      return r!.id;
    })();
    const hit = await page.request.get(
      `/api/vocabulary/lookup?word=qasf4elm&bookId=${bookIdRow}`,
    );
    expect(hit.status()).toBe(200);
    expect(await hit.json()).toEqual({
      word: "qasf4elm",
      ipa: "elm",
      meaning_vi: "cây du (QA sf4)",
      example: "The qasf4elm grows fast.",
      audio_url: AUDIO_REL_PATH,
    });

    // TỪ LẠ → 404 not_in_vocabulary GIỮ NGUYÊN (contract không vỡ)
    const miss = await page.request.get(
      `/api/vocabulary/lookup?word=qasf4zebra&bookId=${bookIdRow}`,
    );
    expect(miss.status()).toBe(404);
    expect(await miss.json()).toEqual({ error: "not_in_vocabulary" });
  });

  test("full-chain: review session mới phát audio Blob (listen → play → gõ từ chấm server)", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(240_000);
    // email admin KHÔNG hardcode — cùng logic default như admin-lib.ts:197
    // (review A P2#2): .env.local đổi ADMIN_EMAIL thì seed/cleanup theo đúng user
    const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@ilec.dev").trim().toLowerCase();
    // due progress cho admin trên 2 từ CÓ audio (oak + elm sau enrich) —
    // xoá progress cũ của admin (tài khoản QA dùng chung) để đếm due deterministic
    const c = db();
    await c`delete from user_word_progress where user_id = (select id from users where email = ${adminEmail})`;
    await c`
      insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
      select u.id, w.id, 2.5, 0, now() - interval '1 hour', 0
      from users u join words w on w.word in ('qasf4oak', 'qasf4elm')
      where u.email = ${adminEmail}`;
    const meaningRows = await c<{ word: string; meaning_vi: string }[]>`
      select word, meaning_vi from words where word in ('qasf4oak', 'qasf4elm')`;
    await c.end();
    const wordByMeaning = new Map(
      meaningRows.map((r) => [r.meaning_vi, r.word]),
    );

    await loginAsAdmin(page);
    await page.goto("/vi/me/vocabulary");
    await expect(page.getByText("Hôm nay cần ôn: 2 từ")).toBeVisible({
      timeout: 60_000,
    });

    // Review runner MỚI (SF-3 vocab-memrise): từ có audio → bước listen trước.
    // Mục đích chính của test giữ nguyên: audio Blob phát THẬT qua nút phát
    // lại ("Dừng audio" = state playing). Listen ẩn word — chọn option đầu,
    // sai thì từ requeue cuối phiên, bước type vẫn chấm đúng (server-side).
    // waitAdvanced: chờ feedback TÁT (auto-advance 1s) trước bước kế — chống
    // bấm lại option disabled của bước cũ (Playwright click ăn trọn timeout).
    const waitAdvanced = async () => {
      for (let w = 0; w < 150; w++) {
        if (await page.getByText("Phiên hoàn tất").isVisible().catch(() => false)) return;
        const fb =
          (await page.getByTestId("feedback-correct").isVisible().catch(() => false)) ||
          (await page.getByTestId("feedback-wrong").isVisible().catch(() => false));
        if (!fb) return;
        await page.waitForTimeout(200);
      }
      throw new Error("feedback không tự mất sau 30s");
    };
    for (let i = 0; i < 12; i++) {
      if (await page.getByText("Phiên hoàn tất").isVisible()) break;
      if (await page.getByTestId("type-input").isVisible()) {
        // gõ từ: prompt = nghĩa VI trong ngoặc kép
        const prompt = (await page.getByTestId("type-prompt").innerText())
          .replaceAll(/[“”]/g, "")
          .trim();
        const word = wordByMeaning.get(prompt);
        expect(word, `prompt khớp fixture: ${prompt}`).toBeTruthy();
        await page.getByTestId("type-input").fill(word!);
        await page.getByTestId("type-input").press("Enter");
        await expect(page.getByTestId("feedback-correct")).toBeVisible({
          timeout: 30_000,
        });
        await waitAdvanced();
      } else if (await page.getByTestId("listen-replay").isVisible()) {
        await page.getByTestId("listen-replay").click();
        await expect(
          page.getByRole("button", { name: "Dừng audio" }).first(),
        ).toBeVisible({ timeout: 10_000 });
        await page.getByTestId("session-option").first().click();
        await expect(
          page
            .getByTestId("feedback-correct")
            .or(page.getByTestId("feedback-wrong"))
            .first(),
        ).toBeVisible({ timeout: 30_000 });
        const cont = page.getByTestId("continue-after-wrong");
        if (await cont.isVisible()) await cont.click();
        await waitAdvanced();
      } else if (await page.getByTestId("option-group").isVisible()) {
        // mc (từ KHÔNG audio — ví dụ elm khi enrich test không chạy trong
        // --grep): heading lộ từ → chọn ĐÚNG nghĩa qua map DB
        const word = (
          await page.getByTestId("step-card").getByRole("heading").innerText()
        ).trim();
        const meaning = [...wordByMeaning.entries()].find(
          ([, w]) => w === word,
        )?.[0];
        expect(meaning, `mc từ fixture: ${word}`).toBeTruthy();
        await page
          .getByTestId("session-option")
          .filter({ hasText: meaning! })
          .click({ timeout: 10_000 });
        await expect(
          page
            .getByTestId("feedback-correct")
            .or(page.getByTestId("feedback-wrong"))
            .first(),
        ).toBeVisible({ timeout: 30_000 });
        const cont = page.getByTestId("continue-after-wrong");
        if (await cont.isVisible()) await cont.click();
        await waitAdvanced();
      } else {
        break;
      }
    }
    await expect(page.getByText("Phiên hoàn tất")).toBeVisible();

    // cả 2 từ type-đúng → due tương lai → hàng ôn rỗng (persist QUA API mới)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Hôm nay không có từ cần ôn")).toBeVisible({
      timeout: 30_000,
    });
  });
});

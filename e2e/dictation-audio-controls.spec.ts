import { expect, test, type Page } from "@playwright/test";

/**
 * Task 4 — Audio controls (context pack slice #3): speed cycle + playbackRate
 * thật, seek theo waveform, replay nonce (ended → phát lại từ 0), audio 404
 * fail-soft (route intercept — KHÔNG đụng content), driver local assert
 * (BLOB_READ_WRITE_TOKEN vắng → resolveAudioUrl /audio/... — blob path chỉ
 * probe code, ghi evidence).
 * Chạy trong config sf2 (port 3210, DB ilec_sf2).
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const START = /start part|bắt đầu/i;

test.describe("Dictation audio controls", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  async function start(page: Page): Promise<Page> {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    return page;
  }

  /** Main audio = audio đầu DOM (element tĩnh, listeners mount-once). */
  function mainAudio(page: Page) {
    return page.locator("audio").first();
  }

  test("Speed cycle 1 → 1.25 → 1.5 → 0.5 → 0.75 → 1 + playbackRate THẬT trên element", async ({
    page,
  }) => {
    await start(page);
    const speedBtn = page.getByRole("button", { name: /^speed|tốc độ/i });
    await expect(speedBtn).toHaveText("1x");

    const expected = ["1.25x", "1.5x", "0.5x", "0.75x", "1x"];
    for (const label of expected) {
      await speedBtn.click();
      await expect(speedBtn).toHaveText(label);
      const rate = await mainAudio(page).evaluate(
        (el) => (el as HTMLAudioElement).playbackRate,
      );
      expect(rate).toBe(parseFloat(label)); // sync effect áp thật vào <audio>
    }
  });

  test("Seek theo waveform: click giữa → currentTime ≈ nửa duration + aria-valuenow cập nhật", async ({
    page,
  }) => {
    await start(page);
    const slider = page.getByRole("slider");
    await slider.click({ position: { x: 200, y: 15 } }); // ~giữa waveform

    await expect
      .poll(
        async () =>
          mainAudio(page).evaluate((el) => (el as HTMLAudioElement).currentTime),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(1); // tone 3.5s — giữa ≈ 1.75s

    const now = await slider.getAttribute("aria-valuenow");
    expect(Number(now)).toBeGreaterThan(0);
  });

  test("Replay nonce: phát hết → icon Replay → click/Tab → currentTime về 0 + phát lại", async ({
    page,
  }) => {
    await start(page);
    const playBtn = page.getByRole("button", { name: /play|pause|replay|phát|tạm dừng|nghe lại/i }).first();

    // Chờ hết audio (3.5s) — icon Play quay lại thành Replay (ended state)
    await expect(playBtn).toHaveAttribute("aria-label", /replay|nghe lại/i, {
      timeout: 8_000,
    });

    // Tab = replay shortcut (spec §3.6) — nonce mới → seek 0 + playing
    await page.keyboard.press("Tab");
    const t = await mainAudio(page).evaluate(
      (el) => (el as HTMLAudioElement).currentTime,
    );
    expect(t).toBeLessThan(0.5); // về đầu
    await expect(playBtn).toHaveAttribute("aria-label", /pause|tạm dừng/i);
  });

  test("Part không có audio: player disabled note + flow dictation VẪN chạy (hint/check/next)", async ({
    page,
  }) => {
    await page.goto("/en/books/level-3/units/1/lessons/99/listen-and-type", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();

    await expect(
      page.getByText(/this sentence has no audio|câu này chưa có audio/i),
    ).toBeVisible(); // fail-soft note, không trắng màn
    await expect(page.getByRole("slider")).toHaveCount(0); // player thay bằng note

    // Flow không phụ thuộc audio: hint lộ từ + check + next bình thường
    await page
      .getByRole("button", { name: /reveal one word|lộ một từ/i })
      .click();
    await expect(page.locator("div.bg-accent")).toBeVisible();
    await page
      .getByRole("textbox")
      .fill("Don't stop believing — hold on to that feeling."); // part 1 fixture (’ → ' vẫn matched)
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
  });

  test("Audio 404 (route intercept): UI không vỡ, play click im lặng, dictation vẫn chạy", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.route(/\.mp3/, (route) => route.fulfill({ status: 404, body: "" }));

    await start(page);
    const playBtn = page
      .getByRole("button", { name: /play|pause|phát|tạm dừng/i })
      .first();
    await playBtn.click(); // play() trên src lỗi — promise reject bị nuốt
    await page.waitForTimeout(1_500);

    expect(pageErrors).toEqual([]); // không unhandled error
    await expect(page.getByRole("textbox")).toBeVisible(); // pane nguyên vẹn
    await page.getByRole("textbox").fill("I play football with my friends every Saturday.");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
  });

  test("Driver local: src audio là /audio/... (BLOB_READ_WRITE_TOKEN vắng — ghi nhận env-matrix)", async ({
    page,
  }) => {
    await start(page);
    const src = await mainAudio(page).evaluate((el) => el.getAttribute("src"));
    expect(src).toMatch(/^\/audio\//); // local driver
    // Blob driver: cần BLOB_READ_WRITE_TOKEN — probe creds dev KHÔNG có
    // (env-matrix SF-1 ghi nhận) → code path getStorageDriver() chỉ review:
    // src/lib/storage.ts resolveAudioUrl() trả Blob CDN URL khi token set.
  });
});

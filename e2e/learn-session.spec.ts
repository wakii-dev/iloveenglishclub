import { expect, test, type Page } from "@playwright/test";
import { LS_BOOK_ID, LS_WORDS } from "./vocabulary-learn-session-fixture";

/**
 * E2E learn session UI (vocab-memrise SF-3, VU-40 — context pack #10):
 * register → /vocabulary/learn/9904 → walkthrough 5 từ qa-ls-* BẰNG UI THẬT
 * (chuột + bàn phím) theo đúng thứ tự queue engine build ra (intro batch 2 →
 * chain mc→listen→type) → tổng kết XP đúng (4×planted + bước đúng, lần-đầu-
 * trong-ngày) → reload giữa phiên không mất planted → sai 1 bước requeue
 * CUỐI HÀNG thấy rõ → keyboard trọn 1 chuỗi từ → mobile 375 không vỡ.
 * Fixture audio là URL mẫu — play() fail mềm (catch), step vẫn render/POST.
 * expect feedback 30s: POST trên dev+Neon shared có spike >15s (compile +
 * connection pool lạnh) — timeout 5s mặc định chết trước khi response về.
 */

const [W1, W2] = LS_WORDS;

type Plan =
  | { kind: "intro"; word: string }
  | { kind: "mc"; word: string; meaning: string; fail?: boolean }
  | { kind: "listen"; meaning: string }
  | { kind: "type"; word: string };

/** Thứ tự queue chuẩn buildLearnSteps (batch 2 intro → chains); fail mc →
 *  đuôi [mc,listen,type] của từ đó xuống CUỐI (requeue contract client). */
function buildPlansFor(
  words: readonly { word: string; meaning: string }[],
  failMcOf?: string,
): Plan[] {
  const plans: Plan[] = [];
  const tail: Plan[] = [];
  for (let i = 0; i < words.length; i += 2) {
    for (const w of words.slice(i, i + 2)) {
      plans.push({ kind: "intro", word: w.word });
    }
    for (const w of words.slice(i, i + 2)) {
      if (failMcOf === w.word) {
        plans.push({ kind: "mc", word: w.word, meaning: w.meaning, fail: true });
        tail.push({ kind: "mc", word: w.word, meaning: w.meaning });
        tail.push({ kind: "listen", meaning: w.meaning });
        tail.push({ kind: "type", word: w.word });
      } else {
        plans.push({ kind: "mc", word: w.word, meaning: w.meaning });
        plans.push({ kind: "listen", meaning: w.meaning });
        plans.push({ kind: "type", word: w.word });
      }
    }
  }
  return [...plans, ...tail];
}

/** Queue 5 từ đầu level (phiên đầy đủ). */
function buildPlans(failMcOf?: string): Plan[] {
  return buildPlansFor(LS_WORDS.slice(0, 5), failMcOf);
}

/** Driver UI: đi từng bước theo plan (chuột); expect tự chờ auto-advance 1s. */
async function play(page: Page, plans: Plan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.kind === "intro") {
      await expect(page.getByRole("heading", { name: plan.word })).toBeVisible();
      // aria-label (Play “{word}”) đè visible text — accessible name là Play
      await expect(
        page.getByRole("button", { name: new RegExp(`Play “${plan.word}”`) }),
      ).toBeVisible();
      await page.getByTestId("introduce-continue").click();
    } else if (plan.kind === "mc") {
      await expect(page.getByTestId("option-group")).toBeVisible();
      await expect(page.getByRole("heading", { name: plan.word })).toBeVisible();
      if (plan.fail) {
        await page
          .getByTestId("session-option")
          .filter({ hasNotText: plan.meaning })
          .first()
          .click();
        await expect(page.getByTestId("feedback-wrong")).toBeVisible({ timeout: 30_000 });
        await page.getByTestId("continue-after-wrong").click();
      } else {
        await page
          .getByTestId("session-option")
          .filter({ hasText: plan.meaning })
          .click();
        await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
      }
    } else if (plan.kind === "listen") {
      await expect(page.getByTestId("listen-replay")).toBeVisible();
      await expect(page.getByTestId("option-group")).toBeVisible();
      await page
        .getByTestId("session-option")
        .filter({ hasText: plan.meaning })
        .click();
      await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(page.getByTestId("type-input")).toBeVisible();
      await page.getByTestId("type-input").fill(plan.word);
      await page.getByTestId("type-input").press("Enter");
      await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    }
  }
}

function qaEmail(tag: string): string {
  return `qa-ls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.ilec`;
}

/** Đăng ký qua UI (pattern review-flow.spec) — trả email đã đăng nhập. */
async function registerUser(page: Page, tag: string): Promise<string> {
  const email = qaEmail(tag);
  await page.goto("/en/register", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/display name|tên hiển thị/i).fill(`QA LS ${tag}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|mật khẩu/i).fill("password123");
  await page
    .locator("form")
    .getByRole("button", { name: /sign up|đăng ký/i })
    .click();
  await page.waitForURL(/\/en$/);
  return email;
}

test.describe("Learn session UI (vocab-memrise SF-3)", () => {
  test.setTimeout(300_000);

  // Bảng chứng POST: status từng bước (chẩn đoán Neon/dev latency)
  test.beforeEach(({ page }) => {
    page.on("response", (res) => {
      if (
        res.url().includes("/api/vocabulary/session") &&
        res.request().method() === "POST"
      ) {
        console.log(`[e2e] POST session → ${res.status()}`);
      }
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("/api/vocabulary/session")) {
        console.log(`[e2e] POST FAILED: ${req.failure()?.errorText}`);
      }
    });
  });

  test("walkthrough 5 từ UI thật — intro→MC→nghe→gõ, tổng kết +25 XP (5×[1 lần-đầu + 4 planted])", async ({
    page,
  }) => {
    await registerUser(page, "walk");
    await page.goto(`/en/vocabulary/learn/${LS_BOOK_ID}`);

    // Header phiên: tên sách · CEFR + meta level 1 (fixture 12 từ → chunk 1)
    await expect(
      page.getByText("QA Learn Session Book · B1"),
    ).toBeVisible();
    await expect(page.getByText("Level 1 · Words 1–10")).toBeVisible();

    await play(page, buildPlans());

    // Tổng kết: 5 từ × (1 XP lần-đầu-trong-ngày/từ + 4 learn-complete) = 25
    // (engine pin SF-2 walkthrough: lần-đầu-trong-ngày là PER (user, word) —
    // bước đúng thứ 2+ của cùng từ không cộng thêm)
    await expect(page.getByTestId("summary-xp")).toHaveText("+25 XP");
    await expect(page.getByTestId("summary-planted")).toHaveText("5");
    await expect(page.getByText("Sprouted", { exact: true })).toBeVisible();
    await expect(page.getByText("5/10", { exact: true })).toBeVisible();
    await expect(page.getByTestId("capnote")).toHaveCount(0); // không capped
  });

  test("sai 1 bước → requeue CUỐI HÀNG thấy rõ, đúng lần sau vẫn tính (tổng vẫn +25)", async ({
    page,
  }) => {
    await registerUser(page, "requeue");
    await page.goto(`/en/vocabulary/learn/${LS_BOOK_ID}`);

    await play(page, buildPlans(W1.word));

    // W1: mc sai 0 XP, listen đúng +1 (lần-đầu-trong-ngày của từ), type +4 →
    // tổng KHÔNG đổi so với all-correct (25) — chỉ miss XP bậc lặp
    await expect(page.getByTestId("summary-xp")).toHaveText("+25 XP");
    await expect(page.getByTestId("summary-planted")).toHaveText("5");
  });

  test("reload giữa phiên → queue còn lại (không làm lại từ đã planted)", async ({
    page,
  }) => {
    await registerUser(page, "reload");
    await page.goto(`/en/vocabulary/learn/${LS_BOOK_ID}`);

    // Hoàn thành 2 từ đầu (+10 XP) rồi F5
    await play(page, buildPlans().slice(0, 8)); // intro1,intro2 + 2 chain
    await expect(page.getByTestId("xp-chip")).toHaveText("+10 XP"); // 2×(1+4)
    await page.reload();

    // GET lại: W1/W2 planted rơi khỏi queue — server bù 2 từ unplanted kế
    // (chunk 1 còn 8 unplanted → queue mới = qa-ls-03..07, 5 từ như phiên đầy)
    await play(page, buildPlansFor(LS_WORDS.slice(2, 7)));
    await expect(page.getByTestId("summary-xp")).toHaveText("+25 XP"); // 5×(1+4)
    await expect(page.getByTestId("summary-planted")).toHaveText("5");
  });

  test("keyboard trọn 1 chuỗi từ — intro (Tab+Enter) → MC (mũi tên+Enter) → nghe → gõ (Enter)", async ({
    page,
  }) => {
    await registerUser(page, "kbd");
    await page.goto(`/en/vocabulary/learn/${LS_BOOK_ID}`);

    // intro1: card tự focus → Tab (audio pill) → Tab (CTA) → Enter
    await expect(page.getByRole("heading", { name: W1.word })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: new RegExp(`Play “${W1.word}”`) }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    // intro2: tương tự (từ có audio → 2 Tab tới CTA)
    await expect(page.getByRole("heading", { name: W2.word })).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");

    // MC W1: radio-group roving tabindex — Tab (miniaudio) → Tab (option đầu
    // là tab-stop duy nhất của nhóm) → ArrowDown tới nghĩa đúng → Enter
    await expect(page.getByRole("heading", { name: W1.word })).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(
      page.getByTestId("session-option").first(),
    ).toBeFocused();
    const options = page.getByTestId("session-option");
    const optionCount = await options.count();
    const meaningIndex = await options
      .filter({ hasText: W1.meaning })
      .evaluate((el) => Array.from(el.parentElement?.children ?? []).indexOf(el));
    for (let i = 0; i < meaningIndex; i++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(options.filter({ hasText: W1.meaning })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });
    await expect(options).toHaveCount(optionCount); // group disable — không advance ngay

    // auto-advance 1s → listen W1: Tab (replay) → Tab (option đầu) → mũi tên
    await expect(page.getByTestId("listen-replay")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("listen-replay")).toBeFocused();
    await page.keyboard.press("Tab");
    const listenOptions = page.getByTestId("session-option");
    const listenIndex = await listenOptions
      .filter({ hasText: W1.meaning })
      .evaluate((el) => Array.from(el.parentElement?.children ?? []).indexOf(el));
    for (let i = 0; i < listenIndex; i++) {
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });

    // type W1: Tab vào input → gõ từ → Enter
    await expect(page.getByTestId("type-input")).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.type(W1.word);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("feedback-correct")).toBeVisible({ timeout: 30_000 });

    // W1 planted: 1 XP lần-đầu-trong-ngày + 4 learn-complete = +5, slot done
    await expect(page.getByTestId("xp-chip")).toHaveText("+5 XP");
    await expect(
      page.getByTestId("seed-progress").locator("[data-state='done']"),
    ).toHaveCount(1);
  });

  test("mobile 375 — đi 1 từ không vỡ layout (scrollWidth ≤ 375)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await registerUser(page, "mobile");
    await page.goto(`/en/vocabulary/learn/${LS_BOOK_ID}`);

    await expect(page.getByRole("heading", { name: W1.word })).toBeVisible();
    await page.getByTestId("introduce-continue").click();
    await expect(page.getByRole("heading", { name: W2.word })).toBeVisible();
    await page.getByTestId("introduce-continue").click();

    await play(page, [
      { kind: "mc", word: W1.word, meaning: W1.meaning },
      { kind: "listen", meaning: W1.meaning },
      { kind: "type", word: W1.word },
    ]);
    await expect(page.getByTestId("xp-chip")).toHaveText("+5 XP");
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});

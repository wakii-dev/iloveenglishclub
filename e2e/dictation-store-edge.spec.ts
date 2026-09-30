import { expect, test, type Page } from "@playwright/test";
import { attemptCountFor, profileOf } from "./db";

/**
 * Task 3 — Store state machine edge TRÊN UI (context pack slice #2): reload
 * giữa chừng (in-memory by design + leg full-reload §5.8), double-Enter
 * (dedup client + idempotent server), frozen review (guard UI), MAX_TYPED_LEN
 * clamp tại UI (QA-102 — silent server reject trước fix).
 * User fixture: register UI prefix `sf2-…@test.ilec` (self-clean bằng
 * scripts/cleanup-test-data.ts cuối run). Chạy trong config sf2.
 */

const LESSON = "/en/books/level-3/units/1/lessons/1/listen-and-type";
const SENT_1 = "I play football with my friends every Saturday.";
const START = /start part|bắt đầu/i;

test.describe("Dictation store edge (reload / double-submit / frozen / max-len)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000); // compile lạnh register/login/action

  /** Register qua UI (auto sign-in) — session stale sau soft-redirect là
   *  papercut ĐÃ registry (SF-1), workaround reload như baseline progress.spec. */
  async function registerSf2(page: Page, tag: string): Promise<string> {
    const email = `sf2-${tag}-${Date.now()}@test.ilec`;
    await page.goto("/en/register", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/display name|tên hiển thị/i).fill(`SF2 ${tag}`);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password|mật khẩu/i).fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /sign up|đăng ký/i })
      .click();
    await page.waitForURL(/\/en$/);
    await page.reload({ waitUntil: "domcontentloaded" });
    return email;
  }

  async function login(page: Page, email: string, next?: string): Promise<void> {
    await page.goto(next ? `/en/login?next=${encodeURIComponent(next)}` : "/en/login", {
      waitUntil: "domcontentloaded",
    });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();
    await page.waitForLoadState("domcontentloaded");
  }

  async function start(page: Page): Promise<void> {
    await page.goto(LESSON, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: START })).toBeVisible();
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
  }

  test("Reload giữa chừng (guest): state in-memory chết → quay lại start-gate (không resume)", async ({
    page,
  }) => {
    await start(page);
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    // Store module-level chết cùng page load — học lại từ start-gate (spec
    // §5.8: KHÔNG resume in-memory; snapshot chỉ dành cho commit khi login)
    await expect(page.getByRole("button", { name: START })).toBeVisible();
  });

  test("Guest reload giữa chừng → login sau reload: pending snapshot commit điểm (leg full-reload §5.8)", async ({
    page,
  }) => {
    const email = await registerSf2(page, "reload");
    await page.context().clearCookies(); // thành guest thật

    await start(page);
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" }); // hard reload — store chết
    // Banner login chỉ render trong dictation pane (start-gate không có) —
    // Start trước rồi click banner link CÓ ?next= (khác link header /en/login)
    await page.getByRole("button", { name: START }).click();
    await expect(page.getByRole("textbox")).toBeVisible();
    await page.locator("a[href*='next=']").first().click();
    await page.waitForURL(/\/en\/login/);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("password123");
    await page
      .locator("form")
      .getByRole("button", { name: /log in|đăng nhập/i })
      .click();
    await page.waitForURL(new RegExp(LESSON.replace(/\//g, "\\/"))); // quay lại lesson

    // Pending snapshot trong sessionStorage → commit khi user xuất hiện
    await expect(page.getByRole("textbox")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => attemptCountFor(email, 1, 1), { timeout: 15_000 })
      .toBe(1);
    expect((await profileOf(email))?.xp).toBe(10);
  });

  test("Double-Enter nhanh với text SAI: 2 check cùng key → DB ĐÚNG 1 row; sửa đúng → +1 row, XP bank 9", async ({
    page,
  }) => {
    const email = await registerSf2(page, "dbl");
    await start(page);
    const ta = page.getByRole("textbox");
    const WRONG = "I play football with my friend every Saturday."; // sai 1 từ — Enter đôi vẫn là check (allCorrect=false)
    await ta.fill(WRONG);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // đôi nhanh — check lại CÙNG text (cùng key dedup)
    await expect(page.locator("span.line-through").first()).toBeVisible();

    await expect
      .poll(async () => attemptCountFor(email, 1, 1), { timeout: 15_000 })
      .toBe(1); // 2 check cùng (partId,text,relaxed,hint) → 1 clientAttemptId → 1 row

    // Sửa đúng → key MỚI → row thứ 2; XP giữ bank từ check đầu (7/8 → 9)
    await ta.fill(SENT_1);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/exactly right|chính xác/i)).toBeVisible();
    await page
      .getByRole("button", { name: /next sentence|câu tiếp/i })
      .click();
    await expect
      .poll(async () => attemptCountFor(email, 1, 1), { timeout: 15_000 })
      .toBe(2);
    expect((await profileOf(email))?.xp).toBe(9);
  });

  test("Frozen review: part resolved → textarea readOnly + Check/Skip/Hint disabled; Enter không đổi gì", async ({
    page,
  }) => {
    await start(page);
    // Part 1 done
    await page.getByRole("textbox").fill(SENT_1);
    await page.keyboard.press("Enter");
    await page
      .getByRole("button", { name: /next sentence|câu tiếp/i })
      .click();
    // Part 2 skip
    await page
      .getByRole("button", { name: /skip this sentence|bỏ qua câu/i })
      .click();
    await expect(page.getByText(/Part 3 of 4|Phần 3 \/ 4/i)).toBeVisible();

    // ‹ về part 2 (skipped — frozen)
    await page.getByRole("button", { name: /previous part|phần trước/i }).click();
    await expect(page.getByText(/Part 2 \/ 4|Phần 2 \/ 4/i)).toBeVisible();
    const ta = page.getByRole("textbox");
    await expect(ta).toHaveAttribute("readonly", "");
    await expect(
      page.getByRole("button", { name: /skip this sentence|bỏ qua câu/i }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /reveal one word|lộ một từ/i }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /check|kiểm tra|^next sentence|câu tiếp/i }),
    ).toBeDisabled();

    // Enter trong frozen textarea → no-op (enterAction guard status !== pending)
    await ta.press("Enter");
    await expect(ta).toHaveAttribute("readonly", ""); // trạng thái không đổi
  });

  test("QA-102 regression: gõ 2001 ký tự — UI clamp 2000 (maxlength) + submit server nhận (không reject êm)", async ({
    page,
  }) => {
    const email = await registerSf2(page, "maxlen");
    await start(page);
    const ta = page.getByRole("textbox");
    await ta.click();
    await ta.pressSequentially("y".repeat(2001)); // gõ thật — maxlength browser enforce
    await expect(ta).toHaveValue(/^[y]{2000}$/); // clamp ĐÚNG 2000

    await page.keyboard.press("Enter"); // check — server NHẬN (≤ MAX_TYPED_LEN)
    await page
      .getByRole("button", { name: /next sentence|câu tiếp/i })
      .click();
    await expect
      .poll(async () => attemptCountFor(email, 1, 1), { timeout: 15_000 })
      .toBe(1); // không bị mất attempt âm thầm
  });
});

import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import { loginUser } from "./today-drivers";
import { TODAY_BOOK_SLUG, type TodayUser } from "./today-fixture";

/**
 * E2E shield consume (daily-journey SF-4, VU-52 — context pack §6): user A
 * seed daily_activity HÔM NAY + HÔM-KIA (gap HÔM QUA) + credits 1 → làm 1
 * part dictation ⇒ recomputeStreakTx (owner duy nhất) freeze HÔM-QUA +
 * credits −1 ⇒ streak tính TỪ HÔM-KIA (3). User B cùng seed 0 credit ⇒
 * streak = 1 (semantics computeStreak thật — identity). Verify header cache
 * (profiles.streak_count qua my-stats) + live (/today snapshot) KHỚP sau
 * write. Số liệu pin fixture qa-today-shield-* (today-fixture.ts).
 *
 * Drive DICTATION path — gate recompute dictation là first-attempt-per-part
 * (vocab gate là day-transition, by-design khác — pin unit test).
 */
dotenv.config({ path: ".env.local" });

let userA: TodayUser;
let userB: TodayUser;
let userC: TodayUser;
let lessonHrefA: string;
let lessonHrefB: string;
let partTextA: string;
let partTextB: string;

/** Lesson + part đầu (published, còn part) của book đang đọc — oracle giống today-page.spec. */
async function nextDictationTarget(
  sql: postgres.Sql,
  uid: string,
): Promise<{ href: string; text: string }> {
  const rows: { unit_number: number; lesson_number: number; text: string }[] =
    await sql`
      select u.number as unit_number, l.number as lesson_number, lp.text
      from lesson_parts lp
      join lessons l on l.id = lp.lesson_id
      join units u on u.id = l.unit_id
      join books b on b.id = u.book_id
      where b.slug = ${TODAY_BOOK_SLUG} and l.published
      order by b.sort_order, u.sort_order, l.number, lp.sort_order, lp.id
      limit 1
    `;
  return {
    href: `/vi/books/${TODAY_BOOK_SLUG}/units/${rows[0]!.unit_number}/lessons/${rows[0]!.lesson_number}/listen-and-type`,
    text: rows[0]!.text,
  };
}

test.beforeAll(async () => {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  const users: { email: string; id: string }[] = await sql`
    select u.email, u.id from users u
    where u.email like 'qa-today-shield-%@test.ilec' order by u.email
  `;
  userA = { id: users[0]!.id, email: users[0]!.email };
  userB = { id: users[1]!.id, email: users[1]!.email };
  userC = { id: users[2]!.id, email: users[2]!.email };
  const a = await nextDictationTarget(sql, userA.id);
  const b = await nextDictationTarget(sql, userB.id);
  lessonHrefA = a.href;
  partTextA = a.text;
  lessonHrefB = b.href;
  partTextB = b.text;
  await sql.end();
});

const START = /start part|bắt đầu/i;

/** Hoạt động THẬT 1 part dictation: Start → gõ đúng text part → Enter (check). */
async function doOneDictationPart(
  page: Page,
  href: string,
  text: string,
): Promise<void> {
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: START }).click();
  const box = page.getByRole("textbox");
  await expect(box).toBeVisible();
  await box.fill(text);
  await box.press("Enter"); // check → submitAttempt server action
}

/** Poll DB đến khi attempts row của user xuất hiện (action compile lạnh tới 115s). */
async function waitForAttemptWritten(
  sql: postgres.Sql,
  uid: string,
  timeoutMs = 150_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows: { id: number }[] =
      await sql`select id from attempts where user_id = ${uid} limit 1`;
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error("attempts không xuất hiện sau 150s — submit không chạy");
}

async function openShieldSql(): Promise<postgres.Sql> {
  return postgres(process.env.DATABASE_URL ?? "", { prepare: false });
}

/** Header cache streak (user-menu my-stats — profiles.streak_count): stats
 * span mang aria-label "… chuỗi # ngày" — containsText lồng số ("1" ⊂ "110"). */
async function expectHeaderStreak(
  page: Page,
  streak: number,
): Promise<void> {
  const statsSpan = page
    .locator("span[aria-label]")
    .filter({ hasText: /XP/ })
    .first();
  await expect(statsSpan).toBeVisible();
  const aria = await statsSpan.getAttribute("aria-label");
  expect(aria).toMatch(new RegExp(`chuỗi ${streak} ngày`));
}

test.describe("Today shield consume (SF-4)", () => {
  test.setTimeout(240_000);

  test("user A: 1 credit + gap hôm-qua → freeze hôm-qua, credits −1, streak bắc cầu (header cache + live khớp)", async ({
    page,
  }) => {
    const sql = await openShieldSql();

    await loginUser(page, userA.email);
    await doOneDictationPart(page, lessonHrefA, partTextA);
    await waitForAttemptWritten(sql, userA.id);

    // DB state sau recompute: freeze hôm-qua + credits 0 + streak cache 3
    const yRows: { d: string }[] = await sql`
      select to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, 'YYYY-MM-DD') as d`;
    const freezes: { date: string }[] = await sql`
      select date::text as date from streak_freezes where user_id = ${userA.id}`;
    expect(freezes.map((r) => r.date)).toEqual([yRows[0]!.d]);
    const [profile]: { shield_credits: number; streak_count: number }[] =
      await sql`
        select shield_credits, streak_count from profiles where id = ${userA.id}`;
    expect(profile!.shield_credits).toBe(0);
    expect(profile!.streak_count).toBe(3);

    // live /today khớp: streak 3 + "được bảo vệ" + Credit: 0/2
    await page.goto("/vi/today");
    await expect(
      page.getByRole("heading", { level: 1, name: /Hôm nay học gì/ }),
    ).toBeVisible();
    const card = page.getByTestId("today-shield-active");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("today-shield-credits")).toHaveText(
      "Credit: 0/2",
    );
    await expect(
      page.locator('section[aria-labelledby="today-streak-heading"]'),
    ).toContainText(/3 ngày/);

    // header CACHE khớp live sau write (my-stats = profiles.streak_count)
    await expectHeaderStreak(page, 3);

    await page.screenshot({
      path: "docs/superpowers/evidence/vu48-sf4/screenshots/shield-userA-protected.png",
      fullPage: true,
    });
    await sql.end();
  });

  test("user B: 0 credit → KHÔNG freeze, streak = 1 (identity), shield trung tính", async ({
    page,
  }) => {
    const sql = await openShieldSql();

    await loginUser(page, userB.email);
    await doOneDictationPart(page, lessonHrefB, partTextB);
    await waitForAttemptWritten(sql, userB.id);

    // identity: 0 credit + 0 freeze — streak cache chỉ hôm nay
    const freezes: { date: string }[] = await sql`
      select date::text as date from streak_freezes where user_id = ${userB.id}`;
    expect(freezes).toHaveLength(0);
    const [profile]: { shield_credits: number; streak_count: number }[] =
      await sql`
        select shield_credits, streak_count from profiles where id = ${userB.id}`;
    expect(profile!.shield_credits).toBe(0);
    expect(profile!.streak_count).toBe(1);

    // live: streak 1, KHÔNG state "được bảo vệ", shield box trung tính
    await page.goto("/vi/today");
    await expect(
      page.getByRole("heading", { level: 1, name: /Hôm nay học gì/ }),
    ).toBeVisible();
    await expect(page.getByTestId("today-shield-active")).toHaveCount(0);
    await expect(page.getByTestId("today-shield-credits")).toHaveText(
      "Credit: 0/2",
    );
    await expect(
      page.locator('section[aria-labelledby="today-streak-heading"]'),
    ).toContainText(/1 ngày/);
    await expectHeaderStreak(page, 1);

    await page.screenshot({
      path: "docs/superpowers/evidence/vu48-sf4/screenshots/shield-userB-neutral.png",
      fullPage: true,
    });
    await sql.end();
  });

  test("/me: badge đã nhận + shield hint (user C — credits 2, chưa tiêu)", async ({
    page,
  }) => {
    await loginUser(page, userC.email);
    await page.goto("/vi/me");
    await expect(
      page.getByRole("heading", { level: 1, name: /Tiến độ của tôi/ }),
    ).toBeVisible();

    // badge OWNED từ ledger user_badges (streak-3 seeded)
    await expect(page.getByTestId("badge-streak-3")).toBeVisible();
    // badge locked kế tiếp cùng metric
    await expect(page.getByTestId("badge-locked-streak-7")).toBeVisible();
    // shield hint trên streak tile
    await expect(
      page.getByText(/2 khiên còn lại/),
    ).toBeVisible();

    await page.screenshot({
      path: "docs/superpowers/evidence/vu48-sf4/screenshots/me-badges-shield-hint.png",
      fullPage: true,
    });
  });

  test("mobile 375 sweep: /today protected + /me badges (a11y/mobile — thay đổi SF-4)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // user A đã consume ở test đầu (streak 3 + protected) — trạng thái giữ
    await loginUser(page, userA.email);
    await page.goto("/vi/today");
    await expect(
      page.locator('section[aria-labelledby="today-streak-heading"]'),
    ).toContainText(/3 ngày/);
    await expect(page.getByTestId("today-shield-active")).toBeVisible();
    await page.screenshot({
      path: "docs/superpowers/evidence/vu48-sf4/screenshots/mobile-today-protected.png",
      fullPage: true,
    });

    await page.goto("/vi/me");
    await expect(
      page.getByRole("heading", { level: 1, name: /Tiến độ của tôi/ }),
    ).toBeVisible();
    await expect(page.getByTestId("badge-streak-3")).toBeVisible();
    await page.screenshot({
      path: "docs/superpowers/evidence/vu48-sf4/screenshots/mobile-me-badges.png",
      fullPage: true,
    });
  });
});

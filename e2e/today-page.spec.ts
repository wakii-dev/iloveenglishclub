import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import {
  TODAY_BOOK_ID,
  type TodayUser,
} from "./today-fixture";
import { loginUser } from "./today-drivers";

/**
 * E2E /today page (daily-journey SF-3, VU-51 — context pack §6): guest
 * redirect giữ next, hero rings đúng seeded (user B: 5/5 phút · 3/5 từ),
 * 3 suggestion card đúng (dictation deep-link sách đang đọc level-5 · due
 * 2 · continue bookId 5), vi/en, a11y smoke, dot ON khi chưa đạt goal kép.
 * Số liệu pin fixture qa-today (today-fixture.ts header).
 */
dotenv.config({ path: ".env.local" });

// user B seed bởi globalSetup — đọc lại email + expected dictation target
let userB: TodayUser;
let dictationHref: string;

test.beforeAll(async () => {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  // user B PIN = candidate CÓ seed profiles (candidate search thừa không có)
  const users: { email: string }[] = await sql`
    select u.email from users u join profiles p on p.id = u.id
    where u.email like 'qa-today-b%@test.ilec' limit 1
  `;
  const idRows: { id: string }[] = await sql`
    select id from users where email = ${users[0]!.email}
  `;
  userB = { id: idRows[0]!.id, email: users[0]!.email };
  // dictation next oracle: bài published ĐẦU TIÊN của sách đang đọc
  // (level-5) còn part chưa attempt (B không có attempt) — order
  // books.sort_order → units.sort_order → lessons.number
  const rows: { unit_number: number; lesson_number: number }[] = await sql`
    select u.number as unit_number, l.number as lesson_number
    from lessons l
    join units u on u.id = l.unit_id
    join books b on b.id = u.book_id
    where b.slug = 'level-5' and l.published
      and exists (select 1 from lesson_parts lp where lp.lesson_id = l.id)
      and not exists (
        select 1 from lesson_parts lp
        join attempts a on a.part_id = lp.id and a.user_id = ${userB.id}
        where lp.lesson_id = l.id and a.accuracy >= 1
      )
    order by b.sort_order, u.sort_order, l.number
    limit 1
  `;
  dictationHref = `/vi/books/level-5/units/${rows[0]!.unit_number}/lessons/${rows[0]!.lesson_number}/listen-and-type`;
  await sql.end();
});

async function gotoToday(page: Page, locale = "vi"): Promise<void> {
  await page.goto(`/${locale}/today`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    locale === "vi" ? "Hôm nay học gì" : "Today's plan",
  );
}

test.describe("Today page (SF-3)", () => {
  test.setTimeout(120_000);

  test("guest /vi/today → redirect login giữ next; nav không dot", async ({
    page,
  }) => {
    await page.goto("/vi/today");
    await page.waitForURL(/\/vi\/login/);
    expect(page.url()).toContain("next=/vi/today");
    // link "Hôm nay" vẫn hiện cho guest (tự redirect login) — không dot
    await expect(
      page.getByRole("navigation").getByRole("link", { name: /Hôm nay|Today/ }),
    ).toBeVisible();
    await expect(page.getByTestId("today-nav-dot")).toHaveCount(0);
  });

  test("VI: hero rings + 3 suggestion cards + quest list + dot ON đúng seeded", async ({
    page,
  }) => {
    await loginUser(page, userB.email);
    await gotoToday(page);

    // dot ON — goal kép chưa đạt (từ 3/5)
    await expect(
      page.getByRole("navigation").getByTestId("today-nav-dot"),
    ).toBeVisible();

    // hero rings đúng số seeded (role=img + aria tỉ số)
    await expect(page.getByRole("img", { name: "Đã nghe 5 trên 5 phút hôm nay" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Đã ôn/luyện 3 trên 5 từ hôm nay" })).toBeVisible();
    // allDone FALSE (từ 3/5) — celebration ẩn; duration hint hiện (parts NULL)
    await expect(page.getByText("Tuyệt vời! Bạn đã hoàn thành cả hai mục tiêu hôm nay.")).toHaveCount(0);
    await expect(page.getByText("Phút ước tính từ audio")).toBeVisible();

    // goal editors: preset 5 active cho phút (goal 5), từ preset 5 active
    const minutePreset5 = page.getByRole("button", { name: "Chọn mục tiêu 5 phút nghe mỗi ngày" });
    await expect(minutePreset5).toHaveAttribute("aria-pressed", "true");

    // 3 suggestion cards: dictation (đang đọc level-5, bài đầu chưa done)
    const dictation = page.getByTestId("suggestion-dictation");
    await expect(dictation.getByText("Từ vựng — Đời sống online")).toBeVisible();
    await expect(dictation.getByText("0/2 phần")).toBeVisible();
    await expect(dictation.getByRole("link", { name: "Nghe và gõ" })).toHaveAttribute(
      "href",
      dictationHref,
    );
    // due: 2 từ
    const due = page.getByTestId("suggestion-due");
    await expect(due.getByText("2 từ đến hạn ôn")).toBeVisible();
    await expect(due.getByRole("link", { name: "Ôn ngay" })).toHaveAttribute(
      "href",
      "/vi/me/vocabulary?scope=all",
    );
    // continue: sách đang đọc level-5
    const cont = page.getByTestId("suggestion-continue");
    await expect(cont.getByText("Học tiếp sách Cấp độ 5")).toBeVisible();
    await expect(cont.getByRole("link", { name: "Học từ mới" })).toHaveAttribute(
      "href",
      `/vi/vocabulary/learn/${TODAY_BOOK_ID}`,
    );

    // quest list: ĐÚNG 3 quest (§2.4) — set sạch của B (không pre-done)
    const quests = page.locator("[data-testid^='quest-']");
    await expect(quests).toHaveCount(3);
    // done-chip exact ("Hoàn thành" cũng xuất hiện trong mô tả quest —
    // khớp exact chỉ chip trạng thái)
    await expect(page.getByText("Hoàn thành", { exact: true })).toHaveCount(0);

    // badge strip + streak + shield
    await expect(page.getByText("Huy hiệu", { exact: true })).toBeVisible();
    await expect(page.getByText("2 ngày")).toBeVisible();
    await expect(page.getByTestId("today-shield-credits")).toHaveText(
      "Credit: 0/2",
    );
  });

  test("EN: /en/today i18n swap đúng cùng số liệu", async ({ page }) => {
    await loginUser(page, userB.email);
    await gotoToday(page, "en");
    await expect(
      page.getByRole("img", { name: "Listened 5 of 5 minutes today" }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Practiced 3 of 5 words today" }),
    ).toBeVisible();
    await expect(page.getByTestId("suggestion-due").getByText("2 words due for review")).toBeVisible();
  });

  test("PATCH goal phút 15 qua preset → ring phản ánh, reload giữ (acceptance #4)", async ({
    page,
  }) => {
    await loginUser(page, userB.email);
    await gotoToday(page);
    // click-with-retry chống pre-hydration race (lesson e2e-authoring)
    const preset15 = page.getByRole("button", {
      name: "Chọn mục tiêu 15 phút nghe mỗi ngày",
    });
    await expect(async () => {
      await preset15.click({ timeout: 2_500 });
      await expect(
        page.getByRole("img", { name: "Đã nghe 5 trên 15 phút hôm nay" }),
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    // reload giữ
    await page.reload();
    await expect(
      page.getByRole("img", { name: "Đã nghe 5 trên 15 phút hôm nay" }),
    ).toBeVisible();
    // preset 15 giờ active (aria-pressed) — trả goal 5 cho suite re-run
    await expect(preset15).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Chọn mục tiêu 5 phút nghe mỗi ngày" })
      .click();
    await expect(
      page.getByRole("img", { name: "Đã nghe 5 trên 5 phút hôm nay" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a11y smoke: 1 h1 · ring aria · progressbar · quest aria-live", async ({
    page,
  }) => {
    await loginUser(page, userB.email);
    await gotoToday(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    // 2 ring role=img có aria-label tỉ số (count toàn trang không pin —
    // element khác có thể thêm role=img)
    await expect(page.getByRole("img", { name: /Đã nghe/ })).toHaveCount(1);
    await expect(page.getByRole("img", { name: /Đã ôn\/luyện/ })).toHaveCount(1);
    // 3 quest progressbar aria đủ valuemin/max
    const bars = page.getByRole("progressbar");
    await expect(bars).toHaveCount(3);
    for (const bar of await bars.all()) {
      await expect(bar).toHaveAttribute("aria-valuemin", "0");
      await expect(bar).toHaveAttribute("aria-valuemax", /[1-9]/);
    }
    // touch targets: CTA chính ≥44px (min-h-44 = 44px)
    const cta = page.getByTestId("suggestion-dictation").getByRole("link");
    const box = await cta.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});

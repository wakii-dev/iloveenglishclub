import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";
import type { TodayUser } from "./today-fixture";
import {
  answerOneStep,
  loginUser,
  reviewCorrectly,
} from "./today-drivers";

/**
 * E2E quest/badge + nav-dot (daily-journey SF-3, VU-51 — context pack §6 +
 * acceptance 3/4): user A (quest-hash pin q-review-5, seed 4 completions
 * hôm qua) ôn 5 từ đúng → /today: quest auto-done + toast 1 lần + badge
 * quests-5; reload KHÔNG toast lại, KHÔNG record lại (ledger RETURNING).
 * User B (set sạch, goals 5/5 · practiced 3/5) ôn 2 từ đúng → goal kép →
 * nav dot TẮT NGAY qua event `ilec:stats-updated` (không reload).
 */
dotenv.config({ path: ".env.local" });

let userA: TodayUser;
let userB: TodayUser;

test.beforeAll(async () => {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  // user PIN = candidate CÓ seed (profiles row) — candidate search thừa
  // không có profiles (join loại — email sort không đáng tin: '-' < '@')
  const pinned: { a_email: string; b_email: string }[] = await sql`
    select
      (select u.email from users u join profiles p on p.id = u.id
        where u.email like 'qa-today-a%@test.ilec' limit 1) as a_email,
      (select u.email from users u join profiles p on p.id = u.id
        where u.email like 'qa-today-b%@test.ilec' limit 1) as b_email
  `;
  userA = { id: "", email: pinned[0]!.a_email };
  userB = { id: "", email: pinned[0]!.b_email };
  await sql.end();
});

async function dbCounts(
  email: string,
): Promise<{ quests: number; badges: number; quests5: number }> {
  const sql = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  const rows: {
    quests: number;
    badges: number;
    quests5: number;
  }[] = await sql`
    select
      (select count(*)::int from quest_completions q join users u on u.id = q.user_id
        where u.email = ${email} and q.date = (now() at time zone 'Asia/Ho_Chi_Minh')::date) as quests,
      (select count(*)::int from user_badges b join users u on u.id = b.user_id
        where u.email = ${email}) as badges,
      (select count(*)::int from user_badges b join users u on u.id = b.user_id
        where u.email = ${email} and b.badge_id = 'quests-5') as quests5
  `;
  await sql.end();
  return rows[0]!;
}

test.describe("Today quest auto-record + nav dot (SF-3)", () => {
  test.setTimeout(180_000);

  test("A: ôn 5 từ → q-review-5 auto-done + badge quests-5 toast đúng 1 lần; reload không lặp", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await loginUser(page, userA.email);

    // baseline trước hoạt động: chưa có quest/badge hôm nay
    const before = await dbCounts(userA.email);
    expect(before.quests).toBe(0);
    expect(before.quests5).toBe(0);

    // ôn 5 từ due đúng (queue = 5 từ qa-today-w3..w7)
    await page.goto("/vi/me/vocabulary?scope=all");
    await reviewCorrectly(page, 5);

    // /today visit 1 — snapshot tx: auto-record + badge award + toast
    await page.goto("/vi/today");
    const questRow = page.getByTestId("quest-q-review-5");
    await expect(questRow).toBeVisible();
    await expect(questRow.getByText("Hoàn thành", { exact: true }).first()).toBeVisible();

    // badge toast ĐÚNG badge đó, ĐÚNG 1 lần (sonner)
    const badgeToast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Huy hiệu mới: 5 nhiệm vụ" });
    await expect(badgeToast).toHaveCount(1);
    // không badge KHÁC được toast
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: "Huy hiệu mới" })
        .filter({ hasNotText: "5 nhiệm vụ" }),
    ).toHaveCount(0);
    // badge strip đã có chip quests-5
    await expect(page.getByTestId("badge-quests-5")).toBeVisible();

    // ledger: đúng 1 lần — 1 row badge, quest hôm nay đã record
    const after = await dbCounts(userA.email);
    expect(after.quests5).toBe(1);
    expect(after.quests).toBeGreaterThanOrEqual(1);

    // reload — KHÔNG toast lại, KHÔNG record lại
    await page.reload();
    await expect(
      page
        .getByTestId("quest-q-review-5")
        .getByText("Hoàn thành", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Huy hiệu mới" }),
    ).toHaveCount(0);
    const afterReload = await dbCounts(userA.email);
    expect(afterReload).toEqual(after);
  });

  test("B: ôn 2 từ → goal kép → dot TẮT ngay qua event (không reload)", async ({
    page,
  }) => {
    await loginUser(page, userB.email);

    // vào review trực tiếp (không /today — dot ở header mọi trang)
    await page.goto("/vi/me/vocabulary?scope=all");
    const navDot = page
      .getByRole("navigation")
      .getByTestId("today-nav-dot");
    await expect(navDot).toBeVisible(); // practiced 3/5 → goalDone false

    // 1 bước đúng (từ 1 — mc/type) → practiced 4/5 — dot CÒN
    await answerOneStep(page);
    await expect(navDot).toBeVisible();

    // đi tiếp tới summary (từ 2) → practiced 5/5 + phút 5/5 = goal kép →
    // event dispatch → dot TẮT NGAY, không reload
    const urlBefore = page.url();
    await reviewCorrectly(page, 2);
    await expect(navDot).toHaveCount(0, { timeout: 15_000 });
    expect(page.url()).toBe(urlBefore); // không reload / điều hướng
  });
});

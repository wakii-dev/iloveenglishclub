/**
 * Integration test SF-3 QA (context pack #9 — leaderboard boundary): view
 * `leaderboard` trên DB thật ilec_sf3 — weekly = ISO Mon–Sun TZ Asia/
 * Ho_Chi_Minh (attempt tuần TRƯỞC không tính) · all_time = profiles.xp ·
 * guest ẩn: view CHỈ expose scope/display_name/avatar_url/xp (không email,
 * không user_id). getLeaderboard gọi THẬT (RSC query — không mock).
 * Chạy: npx vitest run --config vitest.sf3.config.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

// getLeaderboard chain không đụng auth — vẫn mock để cô lập (không session cần)
vi.mock("@/auth", () => ({ auth: async () => null }));

import { getLeaderboard } from "@/lib/gamification/queries";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — cần .env.local");
}
if (!process.env.DATABASE_URL.includes("ilec_sf3")) {
  throw new Error(`DB guard: SF-3 integration chỉ chạy trên ilec_sf3 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();

let seededPartId = 0;
let lastWeekUserId = "";
let thisWeekUserId = "";
const displayLast = `LB Tuan Truoc ${Date.now()}`;
const displayThis = `LB Tuan Nay ${Date.now()}`;

async function mkUser(email: string, displayName: string, xp: number): Promise<string> {
  const id = crypto.randomUUID();
  await raw`insert into users (id, name, email) values (${id}, ${displayName}, ${email})`;
  await raw`insert into profiles (id, display_name, locale, xp) values (${id}, ${displayName}, 'en', ${xp})`;
  return id;
}

/** Insert attempt TRỰC TIẾP với created_at tuỳ ý (điểm tuần theo view SQL).
 *  postgres.js KHÔNG nhận object form — phải unsafe(text, values) (SF-1). */
async function mkAttempt(userId: string, createdAtExpr: string, xp: number): Promise<void> {
  await raw.unsafe(
    `insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id, created_at)
      values ($1, $2, 'I play football with my friends every Saturday.', 1, 100, ${xp}, $3, ${createdAtExpr})`,
    [userId, seededPartId, uuid()],
  );
}

beforeAll(async () => {
  const parts = await raw<{ id: number }[]>`
    select p.id::int as id from lesson_parts p
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    join books b on b.id = un.book_id
    where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
      and p.sort_order = 1 limit 1`;
  seededPartId = parts[0]!.id;

  lastWeekUserId = await mkUser(`sf3-lb-last-${Date.now()}@test.ilec`, displayLast, 123);
  thisWeekUserId = await mkUser(`sf3-lb-this-${Date.now()}@test.ilec`, displayThis, 456);

  // Tuần TRƯỚC: giữa tuần trước (date_trunc tuần này − 3 ngày, naive VN →
  // timestamptz) — bất kể hôm nay là thứ几 trong tuần
  await mkAttempt(
    lastWeekUserId,
    "((date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') - interval '3 days') at time zone 'Asia/Ho_Chi_Minh')",
    50,
  );
  // Tuần NÀY: giờ hiện tại
  await mkAttempt(thisWeekUserId, "now()", 30);
});

afterAll(async () => {
  for (const id of [lastWeekUserId, thisWeekUserId]) {
    await raw`delete from users where id = ${id}`;
  }
  await raw.end();
});

describe("leaderboard boundary — view SQL trên DB thật", () => {
  it("weekly: attempt tuần TRƯỜC không tính, tuần NÀY tính (ISO Mon–Sun TZ+07)", async () => {
    const weekly = await getLeaderboard("weekly");
    const lastRow = weekly.find((r) => r.displayName === displayLast);
    expect(lastRow, "user chỉ có attempt tuần trước KHÔNG được vào weekly").toBeUndefined();

    const thisRow = weekly.find((r) => r.displayName === displayThis);
    expect(thisRow, "user có attempt tuần này phải vào weekly").toBeTruthy();
    expect(thisRow!.xp).toBe(30); // đúng số attempt tuần này, không phải 80
  });

  it("all_time = profiles.xp (không phụ thuộc attempt)", async () => {
    const all = await getLeaderboard("all_time");
    const row = all.find((r) => r.displayName === displayLast);
    expect(row).toBeTruthy();
    expect(row!.xp).toBe(123); // set ở profiles, không có attempt tuần này
  });

  it("guest ẩn: view chỉ expose scope/display_name/avatar_url/xp — KHÔNG email/user_id", async () => {
    const cols = await raw<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_name = 'leaderboard' order by column_name`;
    expect(cols.map((c) => c.column_name).sort()).toEqual([
      "avatar_url",
      "display_name",
      "scope",
      "xp",
    ]);
  });
});

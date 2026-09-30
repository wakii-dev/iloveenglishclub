/**
 * Integration test SF-3 QA (context pack #8 — streak TZ): verify đường submit
 * → daily_activity (source of truth) → computeStreak → profiles cache trên DB
 * thật ilec_sf3. 3 case contract + cap: hôm qua → +1 · hôm nay → giữ ·
 * cách >1 ngày → reset 1 · cap 400 (limit query activityDates). Boundary
 * 23:59 ICT (16:59:59Z/17:00Z) đã phủ ở unit src/lib/gamification/streak.test.ts
 * (giữ nguyên — lane unit); test này assert ngày auto-upsert == vnToday.
 * Chạy: npx vitest run --config vitest.sf3.config.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const sessionState = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
}));
vi.mock("@/auth", () => ({ auth: async () => sessionState.session }));

import { submitAttempt } from "@/lib/actions/submit-attempt";
import { addDays, vnToday } from "@/lib/gamification/streak";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — cần .env.local");
}
if (!process.env.DATABASE_URL.includes("ilec_sf3")) {
  throw new Error(`DB guard: SF-3 integration chỉ chạy trên ilec_sf3 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();
const SENT_1 = "I play football with my friends every Saturday.";

let seededPartId = 0;
const testUserIds: string[] = [];

async function mkUser(email: string): Promise<string> {
  const id = uuid();
  await raw`insert into users (id, name, email) values (${id}, ${email}, ${email})`;
  await raw`insert into profiles (id, display_name, locale) values (${id}, ${email}, 'en')`;
  testUserIds.push(id);
  return id;
}

async function seedDaily(userId: string, dates: string[]): Promise<void> {
  for (const d of dates) {
    await raw`insert into daily_activity (user_id, date, parts_done)
      values (${userId}, ${d}, 1)
      on conflict (user_id, date) do nothing`;
  }
}

async function streakOf(userId: string): Promise<number> {
  const rows = await raw<{ s: number }[]>`
    select streak_count::int as s from profiles where id = ${userId}`;
  return rows[0]?.s ?? -1;
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
});

afterAll(async () => {
  for (const id of testUserIds) {
    await raw`delete from users where id = ${id}`;
  }
  await raw.end();
});

describe("streak TZ (Asia/Ho_Chi_Minh) — submit path trên DB thật", () => {
  const today = vnToday(new Date());
  const yesterday = addDays(today, -1);

  it("hôm qua → +1: seed yesterday, submit hôm nay → streak 2", async () => {
    const user = await mkUser(`sf3-stk-a-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    await seedDaily(user, [yesterday]);

    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    expect(res.streak).toBe(2);
    expect(await streakOf(user)).toBe(2);

    // Ngày auto-upsert == vnToday (TZ nhất quán qua action thật)
    const rows = await raw<{ d: string }[]>`
      select date::text as d from daily_activity where user_id = ${user}`;
    expect(rows.map((r) => r.d)).toContain(today);
  });

  it("hôm nay → giữ: 7 ngày liên tiếp kết thúc hôm nay, submit part khác → recompute vẫn 7 (idempotent)", async () => {
    const user = await mkUser(`sf3-stk-b-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    // Cache phải NHẤT QUÁT source of truth: 7 ngày daily → cache 7
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)));
    await seedDaily(user, week);
    await raw`update profiles set streak_count = 7, last_active_date = ${today} where id = ${user}`;

    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    expect(res.streak).toBe(7); // recompute từ daily — không tăng thêm
    expect(await streakOf(user)).toBe(7);

    // Submit lần 2 cùng ngày → vẫn 7 (recompute idempotent — unit đã phủ,
    // đây là path thật qua action)
    await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(await streakOf(user)).toBe(7);
  });

  it("cách >1 ngày → reset 1: seed hôm-kia, submit hôm nay → streak 1", async () => {
    const user = await mkUser(`sf3-stk-c-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    await seedDaily(user, [addDays(today, -2)]);

    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.streak).toBe(1);
    expect(await streakOf(user)).toBe(1);
  });

  it("cap 400: 401 ngày liên tiếp kết thúc hôm qua → submit hôm nay → streak 400 (không 402)", async () => {
    const user = await mkUser(`sf3-stk-cap-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    // hôm-401 .. hôm-qua (401 ngày) — limit 400 rows của action cắt bớt ngày
    // cũ nhất → streak tối đa 400
    const dates = Array.from({ length: 401 }, (_, i) => addDays(today, -(401 - i)));
    await seedDaily(user, dates);

    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.streak).toBe(400);
    expect(await streakOf(user)).toBe(400);
  });
});

/**
 * Integration test SF-3 QA (context pack #10 — /me stats): getMyStats +
 * getBookProgress THẬT trên DB ilec_sf3 với input KIỂM SOÁT (lesson/parts tự
 * tạo duration biết trước — chống tautology so-query-với-query):
 *  - partsPracticed = DISTINCT parts (replay không đếm kép)
 *  - averageAccuracy = TB best-per-part (attempt sửa lỗi không kéo xuống)
 *  - listenMinutes = sum duration DISTINCT parts (60s+30s+90s = 3.0)
 *  - heatmap window 84 ngày (−83 lấy, −84 loại)
 *  - books: draft lesson KHÔNG đếm; lesson published đủ part acc≥1 mới done
 * Chạy: npx vitest run --config vitest.sf3.config.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const sessionState = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
}));
vi.mock("@/auth", () => ({ auth: async () => sessionState.session }));

import { getBookProgress, getMyStats } from "@/lib/gamification/queries";
import { addDays, vnToday } from "@/lib/gamification/streak";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — cần .env.local");
}
if (!process.env.DATABASE_URL.includes("ilec_sf3")) {
  throw new Error(`DB guard: SF-3 integration chỉ chạy trên ilec_sf3 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();

let userId = "";
let statLessonId = 0;
const statPartIds: number[] = [];
let l3Lesson1Id = 0;
let l3Parts = 0;

async function mkAttempt(partId: number, accuracy: number): Promise<void> {
  await raw.unsafe(
    `insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id)
     values ($1, $2, 'typed', $3, 100, 0, $4)`,
    [userId, partId, accuracy, uuid()],
  );
}

beforeAll(async () => {
  // Self-heal: run trước crash giữa chừng có thể để lại draft cùng number
  // (unique unit_id+number sẽ nhiễu run này) — user TRƯỚC (attempts CASCADE
  // qua profiles; parts RESTRICT khi còn attempt), rồi parts/lessons
  await raw`delete from users where email like 'sf3-me-%@test.ilec'`;
  await raw`delete from lesson_parts where lesson_id in (
    select id from lessons where title_en like 'SF3 me-stats %')`;
  await raw`delete from lessons where title_en like 'SF3 me-stats %'`;

  // User + lesson RIÊNG (draft — publish gate không ảnh hưởng stats read)
  userId = crypto.randomUUID();
  await raw`insert into users (id, name, email) values (${userId}, 'SF3 Me Stats', ${"sf3-me-" + Date.now() + "@test.ilec"})`;
  await raw`insert into profiles (id, display_name, locale) values (${userId}, 'SF3 Me Stats', 'en')`;

  const units = await raw<{ id: number }[]>`
    select un.id::int as id from units un join books b on b.id = un.book_id
    where b.slug = 'level-3' and un.number = 1 limit 1`;
  const siblings = await raw<{ v: string }[]>`
    select vocab_level::text as v from lessons where unit_id = ${units[0]!.id} limit 1`;
  const created = await raw<{ id: number }[]>`
    insert into lessons (unit_id, number, title_en, vocab_level, sort_order, published)
    values (${units[0]!.id}, 991, ${"SF3 me-stats " + Date.now()}, ${siblings[0]!.v}::vocab_level, 991, false)
    returning id`;
  statLessonId = created[0]!.id;

  // 3 parts duration 60s/30s/90s
  const durations = [60_000, 30_000, 90_000];
  for (const [i, d] of durations.entries()) {
    const p = await raw<{ id: number }[]>`
      insert into lesson_parts (lesson_id, sort_order, text, duration_ms)
      values (${statLessonId}, ${i + 1}, ${"part " + i}, ${d}) returning id`;
    statPartIds.push(p[0]!.id);
  }

  // Lesson seeded L3-U1-L1 (published) cho book-progress
  const lesson = await raw<{ id: number; n: number }[]>`
    select l.id::int as id, count(p.id)::int as n
    from lessons l join lesson_parts p on p.lesson_id = l.id
    join units un on un.id = l.unit_id join books b on b.id = un.book_id
    where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
    group by l.id limit 1`;
  l3Lesson1Id = lesson[0]!.id;
  l3Parts = lesson[0]!.n;
});

afterAll(async () => {
  // User TRƯỚC (attempts CASCADE qua profiles; part RESTRICT khi còn attempt
  // — SF-1 hygiene), rồi lesson/parts
  await raw`delete from users where id = ${userId}`;
  await raw`delete from lesson_parts where lesson_id = ${statLessonId}`;
  await raw`delete from lessons where id = ${statLessonId}`;
  await raw.end();
});

describe("getMyStats — /me trên DB thật (input kiểm soát)", () => {
  it("DISTINCT parts · TB best-per-part · listenMinutes = sum duration DISTINCT", async () => {
    // pA: 2 attempts (1.0 rồi 0.8 — best 1.0) · pB: 0.5 · pC: 0.9
    await mkAttempt(statPartIds[0]!, 1.0);
    await mkAttempt(statPartIds[0]!, 0.8);
    await mkAttempt(statPartIds[1]!, 0.5);
    await mkAttempt(statPartIds[2]!, 0.9);

    const stats = await getMyStats(userId);
    expect(stats.partsPracticed).toBe(3); // DISTINCT — replay pA không đếm kép
    expect(stats.averageAccuracy).toBeCloseTo((1.0 + 0.5 + 0.9) / 3, 10); // best-per-part
    expect(stats.listenMinutes).toBeCloseTo(3.0, 10); // 60+30+90s — pA 1 lần
    expect(stats.totalXp).toBe(0); // attempts trực tiếp không qua action — xp profile 0
  });

  it("heatmap window 84 ngày: −83 lấy, −84 loại", async () => {
    const today = vnToday(new Date());
    for (const offset of [0, 83, 84]) {
      await raw`insert into daily_activity (user_id, date, parts_done)
        values (${userId}, ${addDays(today, -offset)}, 1)
        on conflict (user_id, date) do nothing`;
    }
    const stats = await getMyStats(userId);
    const dates = stats.activity.map((a) => a.date);
    expect(dates).toContain(today);
    expect(dates).toContain(addDays(today, -83));
    expect(dates).not.toContain(addDays(today, -84));
  });
});

describe("getBookProgress — books trên DB thật", () => {
  it("lesson published đủ part acc≥1 → done; draft lesson KHÔNG đếm", async () => {
    // Làm ĐỦ part L3-U1-L1 (acc 1.0) → done 1
    const parts = await raw<{ id: number }[]>`
      select id::int as id from lesson_parts where lesson_id = ${l3Lesson1Id} order by sort_order`;
    expect(parts.length).toBe(l3Parts);
    for (const p of parts) await mkAttempt(p.id, 1.0);

    const before = await getBookProgress(userId);
    const l3 = before.find((b) => b.slug === "level-3");
    expect(l3!.doneLessons).toBe(1); // đúng 1 lesson user này hoàn thành
    expect(l3!.totalLessons).toBeGreaterThan(0);

    // Draft stats-lesson: 1 part acc 1.0 — draft KHÔNG bị đếm (published filter)
    await mkAttempt(statPartIds[0]!, 1.0);
    const after = await getBookProgress(userId);
    const l3After = after.find((b) => b.slug === "level-3");
    expect(l3After!.doneLessons).toBe(1); // không đổi
    expect(l3After!.totalLessons).toBe(l3!.totalLessons); // không thêm lesson
  });
});

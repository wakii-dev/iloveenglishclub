/**
 * Integration test SF-3 QA (context pack #6 — submitAttempt edge): gọi action
 * THẬT trên DB `ilec_sf3` (auth mock theo pattern scripts/test-rls.test.ts —
 * sessionState hoisted; KHÔNG mock action). Chạy: npx vitest run --config
 * vitest.sf3.config.ts
 *
 * Edge phủ: unauthorized · badInput (partId/typedText/MAX_TYPED_LEN/UUID) ·
 * partNotFound (part không tồn tại + lesson draft — publish gate) · noProfile ·
 * idempotency clientAttemptId (Enter đôi) · RACE Promise.all cùng
 * clientAttemptId (1 row, XP 1 lần) · 2-tab (2 clientAttemptId — 2 rows, XP
 * 1 lần) · daily_activity distinct-parts (re-check không phình counter).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const sessionState = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
}));
vi.mock("@/auth", () => ({ auth: async () => sessionState.session }));

import { eq } from "drizzle-orm";
import { submitAttempt } from "@/lib/actions/submit-attempt";
import { db } from "@/db";
import { lessonParts, lessons } from "@/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — npx vitest run --config vitest.sf3.config.ts cần .env.local");
}
// DB guard — fixture ghi thẳng DB; chạy nhầm DB khác = ô nhiễm (P2 SF-1)
if (!process.env.DATABASE_URL.includes("ilec_sf3")) {
  throw new Error(`DB guard: SF-3 integration chỉ chạy trên ilec_sf3 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();
const SENT_1 = "I play football with my friends every Saturday.";

let seededPartId = 0;
let draftPartId = 0;
let draftLessonId = 0;
const testUserIds: string[] = [];

/** Tạo user (+profile) trực tiếp SQL — integration không cần UI/bcrypt.
 *  users.id KHÔNG có DB default (drizzle $defaultFn là application-level) —
 *  phải tự sinh UUID. */
async function mkUser(email: string, opts?: { noProfile?: boolean }): Promise<string> {
  const id = uuid();
  await raw`insert into users (id, name, email) values (${id}, ${email}, ${email})`;
  if (!opts?.noProfile) {
    await raw`
      insert into profiles (id, display_name, locale)
      values (${id}, ${email}, 'en')`;
  }
  testUserIds.push(id);
  return id;
}

async function attemptRows(userId: string, partId: number): Promise<number> {
  const rows = await raw<{ n: number }[]>`
    select count(*)::int as n from attempts where user_id = ${userId} and part_id = ${partId}`;
  return rows[0]?.n ?? 0;
}

async function xpOf(userId: string): Promise<number> {
  const rows = await raw<{ xp: number }[]>`
    select xp::int as xp from profiles where id = ${userId}`;
  return rows[0]?.xp ?? -1;
}

beforeAll(async () => {
  // Part 1 lesson demo L3-U1-L1 (seed SF-1 — cùng fixture với e2e)
  const parts = await raw<{ id: number }[]>`
    select p.id::int as id from lesson_parts p
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    join books b on b.id = un.book_id
    where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
      and p.sort_order = 1
    limit 1`;
  seededPartId = parts[0]!.id;

  // Draft lesson + part cho partNotFound (publish gate) — number 990 khỏi
  // đụng (unit_id,number) unique; vocab_level/sort_order copy từ lesson kề
  const units = await raw<{ id: number }[]>`
    select un.id::int as id from units un join books b on b.id = un.book_id
    where b.slug = 'level-3' and un.number = 1 limit 1`;
  const siblings = await raw<{ v: string }[]>`
    select vocab_level::text as v from lessons where unit_id = ${units[0]!.id} limit 1`;
  const created = await raw<{ id: number }[]>`
    insert into lessons (unit_id, number, title_en, vocab_level, sort_order, published)
    values (${units[0]!.id}, 990, ${"SF3 draft probe " + Date.now()}, ${siblings[0]!.v}::vocab_level, 990, false)
    returning id`;
  draftLessonId = created[0]!.id;
  const createdParts = await raw<{ id: number }[]>`
    insert into lesson_parts (lesson_id, sort_order, text, duration_ms)
    values (${draftLessonId}, 1, ${SENT_1}, 5000)
    returning id`;
  draftPartId = createdParts[0]!.id;
});

afterAll(async () => {
  // Fixture tự dọn: users CASCADE (profiles/attempts/daily/progress —
  // confdeltype='c' verified SF-1 hygiene); lesson_parts CASCADE lesson
  await db.delete(lessonParts).where(eq(lessonParts.lessonId, draftLessonId));
  await db.delete(lessons).where(eq(lessons.id, draftLessonId));
  for (const id of testUserIds) {
    await raw`delete from users where id = ${id}`;
  }
  await raw.end();
});

describe("submitAttempt — guard đầu vào (trust boundary)", () => {
  it("unauthorized: không session → error, không ghi DB", async () => {
    sessionState.session = null;
    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.error).toBe("unauthorized");
    expect(res.ok).toBe(false);
  });

  it("badInput: partId ≤0 · typedText rỗng · >MAX_TYPED_LEN · clientAttemptId non-UUID", async () => {
    sessionState.session = { user: { id: "00000000-0000-4000-8000-000000000000" } };
    const base = { usedHint: false, clientAttemptId: uuid() };
    const results = await Promise.all([
      submitAttempt({ ...base, partId: 0, typedText: "x" }),
      submitAttempt({ ...base, partId: -5, typedText: "x" }),
      submitAttempt({ ...base, partId: seededPartId, typedText: "" }),
      submitAttempt({ ...base, partId: seededPartId, typedText: "x".repeat(2001) }),
      submitAttempt({ ...base, partId: seededPartId, typedText: "x", clientAttemptId: "not-a-uuid" }),
      submitAttempt({ ...base, partId: seededPartId, typedText: "x", clientAttemptId: uuid() + "xx" }),
    ]);
    for (const res of results) expect(res.error).toBe("badInput");
  });

  it("MAX_TYPED_LEN biên: 2000 ký tự ĐẠI (xử lý), 2001 loại", async () => {
    const user = await mkUser(`sf3-maxlen-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    const typed2000 = `${SENT_1} `.repeat(50).slice(0, 2000);
    expect(typed2000.length).toBe(2000);

    const ok = await submitAttempt({
      partId: seededPartId,
      typedText: typed2000,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(ok.error).toBeUndefined(); // 2000 = đúng giới hạn, nhận
    expect(await attemptRows(user, seededPartId)).toBe(1);

    const tooLong = await submitAttempt({
      partId: seededPartId,
      typedText: "x".repeat(2001),
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(tooLong.error).toBe("badInput");
  });

  it("partNotFound: part không tồn tại + lesson draft (publish gate)", async () => {
    const user = await mkUser(`sf3-notfound-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    const ghost = await submitAttempt({
      partId: 999_999_999,
      typedText: "x",
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(ghost.error).toBe("partNotFound");
    const draft = await submitAttempt({
      partId: draftPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(draft.error).toBe("partNotFound");
  });

  it("noProfile: user không có profile row → error (register transactional là path tạo profile duy nhất)", async () => {
    const user = await mkUser(`sf3-noprofile-${Date.now()}@test.ilec`, { noProfile: true });
    sessionState.session = { user: { id: user } };
    const res = await submitAttempt({
      partId: seededPartId,
      typedText: SENT_1,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.error).toBe("noProfile");
  });
});

describe("submitAttempt — idempotency + race XP", () => {
  it("Enter đôi (cùng clientAttemptId, tuần tự) → 1 row, lần 2 duplicate không cộng", async () => {
    const user = await mkUser(`sf3-idem-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    const cid = uuid();

    const first = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: cid });
    expect(first.ok).toBe(true);
    expect(first.xpAwarded).toBe(10); // acc 1.0, strict, no hint
    const second = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: cid });
    expect(second.duplicate).toBe(true);
    expect(second.xpAwarded).toBe(0);
    expect(await attemptRows(user, seededPartId)).toBe(1);
    expect(await xpOf(user)).toBe(10);
  });

  it("RACE: 2 submit ĐỒNG LOẠT cùng clientAttemptId → 1 row, XP đúng 1 lần", async () => {
    const user = await mkUser(`sf3-race-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    const cid = uuid();

    const [a, b] = await Promise.all([
      submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: cid }),
      submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: cid }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const awarded = [a, b].filter((r) => (r.xpAwarded ?? 0) > 0);
    expect(awarded.length, "CHỈ 1 request được cộng XP").toBe(1);
    expect(awarded[0]!.xpAwarded).toBe(10);
    expect(await attemptRows(user, seededPartId)).toBe(1);
    expect(await xpOf(user)).toBe(10);
  });

  it("2-tab concurrency (2 clientAttemptId KHÁC nhau, đồng loạt) → 2 rows, XP VẪN 1 lần (isFirst trong tx FOR UPDATE)", async () => {
    const user = await mkUser(`sf3-2tab-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };

    const [a, b] = await Promise.all([
      submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() }),
      submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // Attempt 2 KHÔNG duplicate (clientAttemptId khác) nhưng xpAwarded 0
    const awarded = [a, b].filter((r) => (r.xpAwarded ?? 0) > 0);
    expect(awarded.length, "isFirst chỉ đúng 1 trong 2 tx").toBe(1);
    expect(awarded[0]!.xpAwarded).toBe(10);
    expect(await attemptRows(user, seededPartId)).toBe(2);
    expect(await xpOf(user)).toBe(10);
  });

  it("daily_activity: 2 part cùng ngày → parts_done=2; re-check part cũ KHÔNG phình counter", async () => {
    const user = await mkUser(`sf3-daily-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };

    await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() });
    const nexts = await raw<{ id: number }[]>`
      select p.id::int as id from lesson_parts p
      join lessons l on l.id = p.lesson_id
      join units un on un.id = l.unit_id
      join books b on b.id = un.book_id
      where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
        and p.sort_order = 2 limit 1`;
    await submitAttempt({ partId: nexts[0]!.id, typedText: "She likes reading books in the library.", usedHint: false, clientAttemptId: uuid() });

    const daily = await raw<{ n: number }[]>`
      select parts_done::int as n from daily_activity where user_id = ${user}`;
    expect(daily[0]?.n).toBe(2);

    // Re-check (attempt mới part cũ, cùng ngày) → KHÔNG +1 nữa
    await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() });
    const dailyAgain = await raw<{ n: number }[]>`
      select parts_done::int as n from daily_activity where user_id = ${user}`;
    expect(dailyAgain[0]?.n).toBe(2);
  });
});

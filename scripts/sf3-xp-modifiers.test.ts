/**
 * Integration test SF-3 QA (context pack #7 — XP modifiers truth): bảng chốt
 * spec §5.5 trên DB thật — 10 (strict) / 8 (hint ×0.8) / 5 (relaxed ×0.5) /
 * 4 (hint+relaxed) / accuracy 0.75 → 8·6·3 · CHỈ attempt đầu có XP (replay =
 * 0 kể cả modifier). Relaxed bật qua updateRelaxedMode (action thật, không
 * mock — flag persist profiles.relaxed_mode; server KHÔNG tin client).
 * Chạy: npx vitest run --config vitest.sf3.config.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const sessionState = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
}));
vi.mock("@/auth", () => ({ auth: async () => sessionState.session }));

import { updateRelaxedMode } from "@/lib/actions/relaxed-mode";
import { submitAttempt } from "@/lib/actions/submit-attempt";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — cần .env.local");
}
if (!process.env.DATABASE_URL.includes("ilec_sf3")) {
  throw new Error(`DB guard: SF-3 integration chỉ chạy trên ilec_sf3 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();
const SENT_1 = "I play football with my friends every Saturday.";
// 6/8 token khớp positional (friend≠friends ở vị trí 5, thiếu "Saturday.")
const SENT_075 = "I play football with my friend every Saturday";

let seededPartId = 0;
const testUserIds: string[] = [];

async function mkUser(email: string): Promise<string> {
  const id = uuid(); // users.id không có DB default ($defaultFn app-level)
  await raw`insert into users (id, name, email) values (${id}, ${email}, ${email})`;
  await raw`insert into profiles (id, display_name, locale) values (${id}, ${email}, 'en')`;
  testUserIds.push(id);
  return id;
}

async function xpOf(userId: string): Promise<number> {
  const rows = await raw<{ xp: number }[]>`
    select xp::int as xp from profiles where id = ${userId}`;
  return rows[0]?.xp ?? -1;
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

describe("XP modifiers truth — bảng chốt 10/8/5/0 (server recompute trên DB)", () => {
  it("strict acc1.0 → 10 · hint → 8 (×0.8)", async () => {
    const user = await mkUser(`sf3-xp-a-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };

    const a = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() });
    expect(a.xpAwarded).toBe(10);
    expect(await xpOf(user)).toBe(10);

    // part 2: cùng user, hint=true → 8
    const p2 = await raw<{ id: number }[]>`
      select p.id::int as id from lesson_parts p
      join lessons l on l.id = p.lesson_id
      join units un on un.id = l.unit_id
      join books b on b.id = un.book_id
      where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
        and p.sort_order = 2 limit 1`;
    const b = await submitAttempt({ partId: p2[0]!.id, typedText: "She likes reading books in the library.", usedHint: true, clientAttemptId: uuid() });
    expect(b.xpAwarded).toBe(8);
    expect(await xpOf(user)).toBe(18);
  });

  it("relaxed acc1.0 → 5 (×0.5, flag từ profiles — action thật) · relaxed+hint → 4", async () => {
    const user = await mkUser(`sf3-xp-b-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };

    // Action THẬT persist flag (client chỉ toggle — server tự đọc profile)
    const upd = await updateRelaxedMode(true);
    expect(upd.ok).toBe(true);

    const a = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() });
    expect(a.xpAwarded).toBe(5);
    expect(await xpOf(user)).toBe(5);

    const p2 = await raw<{ id: number }[]>`
      select p.id::int as id from lesson_parts p
      join lessons l on l.id = p.lesson_id
      join units un on un.id = l.unit_id
      join books b on b.id = un.book_id
      where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
        and p.sort_order = 2 limit 1`;
    const b = await submitAttempt({ partId: p2[0]!.id, typedText: "She likes reading books in the library.", usedHint: true, clientAttemptId: uuid() });
    expect(b.xpAwarded).toBe(4); // round(10 × 1.0 × 0.8 × 0.5)
    expect(await xpOf(user)).toBe(9);

    // Tắt relaxed → attempt mới trở lại strict
    await updateRelaxedMode(false);
    const p3 = await raw<{ id: number }[]>`
      select p.id::int as id from lesson_parts p
      join lessons l on l.id = p.lesson_id
      join units un on un.id = l.unit_id
      join books b on b.id = un.book_id
      where b.slug = 'level-3' and un.number = 1 and l.number = 1 and l.published
        and p.sort_order = 3 limit 1`;
    const c = await submitAttempt({ partId: p3[0]!.id, typedText: "We watch a film at the weekend.", usedHint: false, clientAttemptId: uuid() });
    expect(c.xpAwarded).toBe(10);
  });

  it("accuracy 0.75 strict → 8 · relaxed → 3 (round(3.75))", async () => {
    const user = await mkUser(`sf3-xp-c-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };

    const a = await submitAttempt({ partId: seededPartId, typedText: SENT_075, usedHint: false, clientAttemptId: uuid() });
    expect(a.xpAwarded).toBe(8); // round(10 × 0.75) = round(7.5) = 8

    const user2 = await mkUser(`sf3-xp-d-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user2 } };
    await updateRelaxedMode(true);
    const b = await submitAttempt({ partId: seededPartId, typedText: SENT_075, usedHint: false, clientAttemptId: uuid() });
    expect(b.xpAwarded).toBe(4); // round(10 × 0.75 × 0.5) = round(3.75) = 4
  });

  it("replay = 0 BẤT CHẤP modifier (attempt 2 cùng part: hint+relaxed vẫn 0)", async () => {
    const user = await mkUser(`sf3-xp-e-${Date.now()}@test.ilec`);
    sessionState.session = { user: { id: user } };
    await updateRelaxedMode(true);

    const first = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: false, clientAttemptId: uuid() });
    expect(first.xpAwarded).toBe(5);

    // Replay: cid khác (không phải duplicate) + hint + relaxed → vẫn 0
    const replay = await submitAttempt({ partId: seededPartId, typedText: SENT_1, usedHint: true, clientAttemptId: uuid() });
    expect(replay.duplicate).toBeUndefined();
    expect(replay.ok).toBe(true);
    expect(replay.xpAwarded).toBe(0);
    expect(await xpOf(user)).toBe(5);
  });
});

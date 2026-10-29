/**
 * Integration test daily-journey SF-1 (VU-49): gọi action THẬT trên DB
 * `ilec_vu48_sf1` (clone template `ilec` — auth mock theo pattern
 * scripts/sf3-submit-attempt.test.ts, KHÔNG mock action/db). Chạy:
 *   npx vitest run --config vitest.sf1.config.ts
 *
 * Phủ (context pack sf-1 ACCEPTANCE):
 *  1. Migration 0007 áp TRỰC TIẾP lên DB thật (dry-run): DDL + backfill
 *     chạy xanh; backfill ĐÚNG rule pinned — per (user, part, VN-day)
 *     DISTINCT part, cộng coalesce(duration_ms, 0) ĐÚNG 1 lần; row chưa có
 *     thì TẠO (parts_done=0); row CÓ sẵn giữ nguyên parts_done (presence
 *     không đụng); ranh giới VN-day qua UTC 17:00 pinned.
 *  2. Write-path listen_ms (submit-attempt hunk): attempt ĐẦU part trong
 *     ngày → listen_ms tăng ĐÚNG duration; attempt lại CÙNG part cùng ngày
 *     → KHÔNG cộng thêm; part NULL duration → +0; part khác → cộng riêng.
 *
 * Re-runnable: trước apply, reset migration state (drop col/table mới) —
 * backfill re-aggregate từ attempts, deterministic (fixture user id unique
 * theo run, cleanup cascade).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const sessionState = vi.hoisted(() => ({
  session: null as { user?: { id?: string } } | null,
}));
vi.mock("@/auth", () => ({ auth: async () => sessionState.session }));

import { eq } from "drizzle-orm";
import { submitAttempt } from "@/lib/actions/submit-attempt";
import { db } from "@/db";
import { lessonParts } from "@/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — npx vitest run --config vitest.sf1.config.ts cần .env.local");
}
// DB guard — fixture ghi thẳng DB; chạy nhầm DB khác = ô nhiễm (P2 SF-1 QA)
if (!process.env.DATABASE_URL.includes("ilec_vu48_sf1")) {
  throw new Error(`DB guard: SF-1 integration chỉ chạy trên ilec_vu48_sf1 (nhận: ${process.env.DATABASE_URL})`);
}

const raw = postgres(process.env.DATABASE_URL, { prepare: false });
const uuid = () => crypto.randomUUID();
const RUN = Date.now(); // fixture id unique theo run — re-run an toàn

const BACKFILL_USER_EMAIL = `qa-vu48-backfill-${RUN}@test.ilec`;
const WRITE_USER_EMAIL = `qa-vu48-write-${RUN}@test.ilec`;
let backfillUserId = "";
let writeUserId = "";
const testUserIds: string[] = [];

// Fixture content chain — id cao khỏi đụng seed (pattern VU-37: 9371)
const BOOK_ID = 9481;
const UNIT_ID = 9481;
const LESSON_ID = 9481;
const PART_A = 9481001; // duration 60000ms
const PART_B = 9481002; // duration NULL
const PART_C = 9481003; // duration 30000ms
const PART_TEXT = "qa vu48 part text";

/**
 * Backfill fixture attempts — VN-day pinned qua created_at UTC:
 *  2026-09-28T02:00:00Z = 09:00 VN 28 → D1
 *  2026-09-28T16:59:59Z = 23:59:59 VN 28 → D1 (cùng part A cùng ngày — DISTINCT)
 *  2026-09-28T17:00:00Z = 00:00 VN 29 → D2 (ranh giới TZ — part C có duration
 *    30000 ≠ 0 để phân biệt TZ: đọc sai UTC-day sẽ cho D1=90000/D2=60000 → RED)
 *  2026-09-29T02:00:00Z = 09:00 VN 29 → D2
 * Expect backfill (VN đúng): D1={A}→60000 · D2={A,B,C}→60000+0+30000=90000.
 */
const FIXTURE_ATTEMPTS: Array<{ partId: number; at: string; cid: string }> = [
  { partId: PART_A, at: "2026-09-28T02:00:00Z", cid: uuid() },
  { partId: PART_A, at: "2026-09-28T16:59:59Z", cid: uuid() },
  { partId: PART_A, at: "2026-09-29T02:00:00Z", cid: uuid() },
  { partId: PART_B, at: "2026-09-28T17:00:00Z", cid: uuid() },
  { partId: PART_C, at: "2026-09-28T17:00:00Z", cid: uuid() },
];

async function resetMigrationState(db: postgres.Sql) {
  // Idempotent re-run: bỏ schema 0007 nếu đã áp (backfill re-aggregate từ
  // attempts — deterministic; listen_ms reset về default)
  await db`alter table daily_activity drop column if exists listen_ms`;
  await db`alter table profiles drop column if exists daily_goal_minutes`;
  await db`alter table profiles drop column if exists shield_credits`;
  await db`drop table if exists user_badges`;
  await db`drop table if exists quest_completions`;
  await db`drop table if exists shield_grants`;
  await db`drop table if exists streak_freezes`;
}

async function applyMigration0007(db: postgres.Sql) {
  const migrationSql = readFileSync(
    path.resolve(__dirname, "../drizzle/0007_daily_journey_foundation.sql"),
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of migrationSql) {
    await db.unsafe(statement);
  }
}

async function listenMsOf(db: postgres.Sql, userId: string, date: string) {
  const rows = await db<{ listen_ms: number; parts_done: number }[]>`
    select listen_ms::int as listen_ms, parts_done::int as parts_done
    from daily_activity where user_id = ${userId} and date = ${date}::date`;
  return rows[0] ?? null;
}

async function cleanup(db: postgres.Sql) {
  // users CASCADE (profiles/attempts/daily_activity); lesson_parts restrict
  // attempts → attempts phải sạch trước khi drop book chain
  await db`delete from users where email like ${"qa-vu48-%@test.ilec"}`;
  await db`delete from attempts where part_id in (${PART_A}, ${PART_B}, ${PART_C})`;
  await db`delete from books where id = ${BOOK_ID}`;
}

beforeAll(async () => {
  await cleanup(raw); // leftover run trước (an toàn khi không có)

  // Content chain published — gate submitAttempt
  await raw`insert into books (id, slug, title_en, cefr_label, color, sort_order)
    values (${BOOK_ID}, 'qa-vu48-book', 'QA VU48 Book', 'A1', '#000000', 9481)`;
  await raw`insert into units (id, book_id, number, title_en, sort_order)
    values (${UNIT_ID}, ${BOOK_ID}, 1, 'QA VU48 Unit', 1)`;
  await raw`insert into lessons (id, unit_id, number, title_en, kind, vocab_level, sort_order, published)
    values (${LESSON_ID}, ${UNIT_ID}, 9481, 'QA VU48 Lesson', 'dictation', 'A1', 9481, true)`;
  await raw`insert into lesson_parts (id, lesson_id, sort_order, text, duration_ms) values
    (${PART_A}, ${LESSON_ID}, 1, ${PART_TEXT}, 60000),
    (${PART_B}, ${LESSON_ID}, 2, ${PART_TEXT}, null),
    (${PART_C}, ${LESSON_ID}, 3, ${PART_TEXT}, 30000)`;

  // Users + profiles
  const ids = [uuid(), uuid()];
  backfillUserId = ids[0]!;
  writeUserId = ids[1]!;
  testUserIds.push(...ids);
  await raw`insert into users (id, name, email) values
    (${backfillUserId}, ${BACKFILL_USER_EMAIL}, ${BACKFILL_USER_EMAIL}),
    (${writeUserId}, ${WRITE_USER_EMAIL}, ${WRITE_USER_EMAIL})`;
  await raw`insert into profiles (id, display_name, locale) values
    (${backfillUserId}, 'QA VU48 Backfill', 'en'),
    (${writeUserId}, 'QA VU48 Write', 'en')`;

  // Backfill attempts (created_at pinned UTC) — TRƯỚC khi migrate
  for (const a of FIXTURE_ATTEMPTS) {
    await raw`insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id, created_at)
      values (${backfillUserId}, ${a.partId}, ${PART_TEXT}, 1, 60, 10, ${a.cid}, ${a.at}::timestamptz)`;
  }
  // daily_activity D1 CÓ SẰN (parts_done=2) — backfill KHÔNG được đụng presence
  await raw`insert into daily_activity (user_id, date, parts_done, vocab_steps)
    values (${backfillUserId}, '2026-09-28'::date, 2, 7)`;

  // Migration dry-run: reset state (re-run an toàn) → áp 0007 thật
  await resetMigrationState(raw);
  await applyMigration0007(raw);
}, 60_000);

afterAll(async () => {
  await cleanup(raw);
  await db.delete(lessonParts).where(eq(lessonParts.lessonId, LESSON_ID));
  await raw.end();
}, 60_000);

describe("Migration 0007 dry-run — backfill rule pinned (spec §3.1)", () => {
  it("DDL: listen_ms/daily_goal_minutes/shield_credits + 4 bảng tồn tại", async () => {
    const cols = await raw<{ n: number }[]>`
      select count(*)::int as n from information_schema.columns
      where table_name in ('daily_activity', 'profiles')
        and column_name in ('listen_ms', 'daily_goal_minutes', 'shield_credits')`;
    expect(cols[0]?.n).toBe(3);
    const tables = await raw<{ n: number }[]>`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public'
        and table_name in ('streak_freezes', 'shield_grants', 'quest_completions', 'user_badges')`;
    expect(tables[0]?.n).toBe(4);
  });

  it("backfill D1 (2026-09-28): {A} 1 lần → 60000; parts_done=2 GIỮ NGUYÊN", async () => {
    const row = await listenMsOf(raw, backfillUserId, "2026-09-28");
    expect(row?.listen_ms).toBe(60000);
    expect(row?.parts_done).toBe(2); // presence semantics KHÔNG đụng
  });

  it("backfill D2 (2026-09-29): {A,B,C} → 60000+0+30000=90000; row TẠO MỚI parts_done=0", async () => {
    const row = await listenMsOf(raw, backfillUserId, "2026-09-29");
    expect(row).not.toBeNull(); // row chưa có → TẠO
    expect(row?.listen_ms).toBe(90000); // NULL duration góp 0
    expect(row?.parts_done).toBe(0);
  });

  it("ranh giới VN-day: attempt 2026-09-28T17:00Z (=00:00 VN 29) thuộc D2, KHÔNG D1", async () => {
    // Part C (30000) ở 17:00Z: đọc đúng VN → D1=60000/D2=90000; đọc SAI
    // UTC-day → D1=90000/D2=60000 → 2 assertion listen_ms ở trên RED
    // (meta-test đã chứng minh: patch migration sang ::date → suite đỏ).
    const rows = await raw<{ d: string }[]>`
      select date::text as d from daily_activity where user_id = ${backfillUserId} order by date`;
    expect(rows.map((r) => r.d)).toEqual(["2026-09-28", "2026-09-29"]);
  });

  it("user không có attempt → KHÔNG row daily_activity (backfill không bắn row rác)", async () => {
    const rows = await raw<{ n: number }[]>`
      select count(*)::int as n from daily_activity where user_id = ${writeUserId}`;
    expect(rows[0]?.n).toBe(0);
  });
});

describe("Write-path listen_ms — submitAttempt (attempt thật)", () => {
  it("attempt ĐẦU part A (60s) hôm nay → listen_ms=60000, parts_done=1", async () => {
    sessionState.session = { user: { id: writeUserId } };
    const res = await submitAttempt({
      partId: PART_A,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    const today = await raw<{ d: string }[]>`
      select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as d`;
    const row = await listenMsOf(raw, writeUserId, today[0]!.d);
    expect(row?.listen_ms).toBe(60000);
    expect(row?.parts_done).toBe(1);
  });

  it("attempt LẠI part A cùng ngày → listen_ms KHÔNG cộng thêm (60000), parts_done giữ 1", async () => {
    sessionState.session = { user: { id: writeUserId } };
    const res = await submitAttempt({
      partId: PART_A,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    const today = await raw<{ d: string }[]>`
      select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as d`;
    const row = await listenMsOf(raw, writeUserId, today[0]!.d);
    expect(row?.listen_ms).toBe(60000);
    expect(row?.parts_done).toBe(1);
  });

  it("part B NULL duration → +0 (coalesce semantics, không constraint violation)", async () => {
    sessionState.session = { user: { id: writeUserId } };
    const res = await submitAttempt({
      partId: PART_B,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    const today = await raw<{ d: string }[]>`
      select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as d`;
    const row = await listenMsOf(raw, writeUserId, today[0]!.d);
    expect(row?.listen_ms).toBe(60000);
    expect(row?.parts_done).toBe(2);
  });

  it("part C (30s) → cộng riêng: 60000+30000=90000; streak cache recompute như cũ (=1)", async () => {
    sessionState.session = { user: { id: writeUserId } };
    const res = await submitAttempt({
      partId: PART_C,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: uuid(),
    });
    expect(res.ok).toBe(true);
    expect(res.streak).toBe(1); // hành vi cũ recompute giữ nguyên
    const today = await raw<{ d: string }[]>`
      select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as d`;
    const row = await listenMsOf(raw, writeUserId, today[0]!.d);
    expect(row?.listen_ms).toBe(90000);
    expect(row?.parts_done).toBe(3);
  });

  it("duplicate clientAttemptId (Enter đôi) → KHÔNG cộng gì (idempotency nguyên vẹn)", async () => {
    sessionState.session = { user: { id: writeUserId } };
    const cid = uuid();
    const first = await submitAttempt({
      partId: PART_A,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: cid,
    });
    expect(first.duplicate).toBeFalsy(); // A đã attempt — không phải duplicate path
    const dup = await submitAttempt({
      partId: PART_A,
      typedText: PART_TEXT,
      usedHint: false,
      clientAttemptId: cid,
    });
    expect(dup.duplicate).toBe(true);
    const today = await raw<{ d: string }[]>`
      select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text as d`;
    const row = await listenMsOf(raw, writeUserId, today[0]!.d);
    expect(row?.listen_ms).toBe(90000);
  });
});

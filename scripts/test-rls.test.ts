/**
 * Authorization test per-role (context pack SF-2: "RLS test script assert
 * từng role — anon/user/admin đọc được gì, bị chặn gì — script tự chạy").
 *
 * PIVOT (REQUIREMENT-GAP trên epic VU-15): Supabase RLS → app-level authz.
 * Tên file giữ `test-rls` theo touch map; ý nghĩa = assert SEMANTICS mỗi role:
 * - anon: content published-only, draft ẩn, không ghi được gì
 * - user non-admin: bị chặn ghi content (assertAdmin deny), không có path
 *   đọc hộ data user khác (isolation-by-API-surface — SF-6 phải scope theo
 *   session khi viết query attempts)
 * - admin: assertAdmin cho qua
 * - DB contract: UNIQUE anti double-submit, DELETE RESTRICT part-có-attempts,
 *   view leaderboard chỉ expose cột cho phép + XP tuần ISO đúng, invariant
 *   users↔profiles (thay thế TRIGGER on_auth_user_created — deviation chốt
 *   trong plan §2: events.createUser + register transaction là 2 path tạo
 *   profile, KHÔNG dùng DB trigger vì vỡ registerAction).
 *
 * Chạy: npm run db:seed trước → npm run test:rls. Exit 0 = sạch.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

// ---- Mocks: Next runtime không có ở đây — bypass cache wrapper, control session
const sessionState = vi.hoisted(() => ({ session: null as { user?: { id?: string } } | null }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => {},
}));
vi.mock("@/auth", () => ({
  auth: async () => sessionState.session,
}));

import { assertAdmin, ForbiddenError } from "@/lib/content/guards";
import { updateRelaxedMode } from "@/lib/actions/relaxed-mode";
import {
  getBook,
  getBooks,
  getLesson,
  getLessons,
  getUnits,
} from "@/lib/content/queries";
import { db } from "@/db";
import * as contentQueries from "@/lib/content/queries";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL thiếu — npm run test:rls cần .env.local (DB local + seed)");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_ADMIN = "33333333-3333-4333-8333-333333333333";
const ID_NOPROFILE = "44444444-4444-4444-8444-444444444444";
const EMAIL_SUFFIX = "@rls-test.invalid";

async function insertUserWithProfile(
  id: string,
  email: string,
  role: "user" | "admin",
  xp: number,
): Promise<void> {
  await sql`
    INSERT INTO users (id, name, email) VALUES (${id}, ${"RLS " + role}, ${email})
  `;
  await sql`
    INSERT INTO profiles (id, display_name, role, xp)
    VALUES (${id}, ${"RLS " + role}, ${role}, ${xp})
  `;
}

let demoPartId: number;

beforeAll(async () => {
  const seeded = await sql`SELECT count(*)::int AS n FROM books`;
  if (seeded[0].n < 7) {
    throw new Error("DB chưa seed — chạy `npm run db:seed` trước `npm run test:rls`");
  }

  // Dọn leftover fixtures (id fixed — re-run an toàn)
  await sql`DELETE FROM users WHERE id IN (${ID_A}, ${ID_B}, ${ID_ADMIN}, ${ID_NOPROFILE})`;

  // userA: có attempts (tuần này + 8 ngày trước), xp cache 50
  await insertUserWithProfile(ID_A, "rls-a" + EMAIL_SUFFIX, "user", 50);
  // userB: không attempts, xp 0 → không được xuất hiện trong cả 2 bảng leaderboard
  await insertUserWithProfile(ID_B, "rls-b" + EMAIL_SUFFIX, "user", 0);
  await insertUserWithProfile(ID_ADMIN, "rls-admin" + EMAIL_SUFFIX, "admin", 0);
  // user KHÔNG có profile — invariant check phải bắt được drift
  await sql`INSERT INTO users (id, name, email) VALUES (${ID_NOPROFILE}, 'RLS noprofile', ${"rls-np" + EMAIL_SUFFIX})`;

  const [part] = await sql<{ id: number }[]>`
    SELECT p.id FROM lesson_parts p
    JOIN lessons l ON p.lesson_id = l.id
    JOIN units u ON l.unit_id = u.id
    JOIN books b ON u.book_id = b.id
    WHERE b.slug = 'level-3' AND u.number = 1 AND l.number = 1 AND p.sort_order = 1
  `;
  demoPartId = part.id;

  // XP mỗi attempt là số nguyên (spec §5: xp = round(10×acc×mods)) — fixture
  // theo đúng contract; 9 ghốc vào đầu tuần ISO hiện tại +1h, 3 lùi 8 ngày
  // (luôn ngoài tuần hiện tại). Race biên tuần (~1e-7 khi suite chạy sát
  // CN 23:59) xử lý ở ASSERTION weekly — expected tính theo cùng week-anchor
  // tại query-time (review vòng 2: timestamp cố định nào cũng chết ở crossing).
  await sql`
    INSERT INTO attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id, created_at)
    VALUES
      (${ID_A}, ${demoPartId}, 'typed', 0.9, 60, 9, 'aaaaaaaa-1111-4111-8111-111111111111',
        date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' + interval '1 hour'),
      (${ID_A}, ${demoPartId}, 'typed', 0.6, 55, 3, 'aaaaaaaa-2222-4222-8222-222222222222',
        date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh' - interval '8 days')
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${ID_A}, ${ID_B}, ${ID_ADMIN}, ${ID_NOPROFILE})`;
  await sql.end({ timeout: 5 });
  // @/db singleton dùng chung pool — đóng để vitest process exit được
  const client = (db as unknown as { $client: postgres.Sql }).$client;
  await client.end({ timeout: 5 });
});

describe("ROLE anon — content published-only", () => {
  it("getBooks trả đủ 7 sách, đúng thứ tự + localize", async () => {
    const books = await getBooks("vi");
    expect(books).toHaveLength(7);
    expect(books[0].slug).toBe("level-1");
    expect(books[0].title).toBe("Cấp độ 1 — Starter");
    expect(books[2].cefrLabel).toBe("A2");
    expect(books[2].examTarget).toBe("A2 Key (KET) for Schools");
  });

  it("getUnits/getLessons: draft lesson (published=false) ẨN với anon", async () => {
    const units = await getUnits("level-3", "vi");
    expect(units.map((u) => u.number)).toEqual([1, 2]);
    const lessonsU2 = await getLessons("level-3", "2", "vi");
    // seed có L3-U2-L3 draft — anon chỉ thấy [1, 2]
    expect(lessonsU2.map((l) => l.number)).toEqual([1, 2]);
  });

  it("getLesson(draft) → null; getLesson(published) → đủ parts + audio_path", async () => {
    expect(await getLesson("level-3", "2", "3", "vi")).toBeNull();
    const demo = await getLesson("level-3", "1", "1", "vi");
    expect(demo).not.toBeNull();
    expect(demo!.parts).toHaveLength(4);
    expect(demo!.parts[0].audioPath).toBe("audio/level-3/unit-1/lesson-1/01.mp3");
    expect(demo!.parts[0].durationMs).toBe(3500);
  });

  it("FALLBACK vi→en: lesson title_vi NULL → hiện title tiếng Anh, không rỗng", async () => {
    const lesson = await getLesson("level-3", "1", "2", "vi");
    expect(lesson!.title).toBe("Dialogue — After school");
  });

  it("unit/book không tồn tại → null/rỗng (notFound ở pages)", async () => {
    expect(await getBook("khong-ton-tai", "vi")).toBeNull();
    expect(await getUnits("khong-ton-tai", "vi")).toEqual([]);
    expect(await getLesson("level-3", "99", "1", "vi")).toBeNull();
  });
});

describe("ROLE user (authenticated non-admin) — bị chặn ghi, không lộ data người khác", () => {
  it("assertAdmin DENY user thường (ForbiddenError)", async () => {
    sessionState.session = { user: { id: ID_A } };
    await expect(assertAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("assertAdmin DENY guest (chưa đăng nhập)", async () => {
    sessionState.session = null;
    await expect(assertAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("isolation-by-surface: queries lib KHÔNG expose hàm nào đọc data theo userId tùy ý", async () => {
    // Attempts/progress/daily_activity của userB tồn tại ở DB-level nhưng
    // surface public chỉ gồm 6 hàm content — SF-6 phải thêm query
    // scope-theo-session, không có lỗ hổng sẵn.
    const exports = Object.keys(contentQueries).filter(
      (k) => typeof (contentQueries as Record<string, unknown>)[k] === "function",
    );
    expect(exports.sort()).toEqual(
      ["getBook", "getBooks", "getLesson", "getLessons", "getUnit", "getUnits"].sort(),
    );
    // data userB có thật ở DB nhưng không có path public nào trả nó
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM attempts WHERE user_id = ${ID_B}
    `;
    expect(row.n).toBe(0); // userB không attempts; userA có — chỉ owner đọc được qua SF-6
  });

  it("profiles self-write CHỈ relaxed_mode — xp/role/streak không thể đụng qua action user-facing (SF-8 audit P0-critic #2)", async () => {
    // Write surface DUY NHẤT của user thường lên profiles là updateRelaxedMode
    // (drizzle .set column-whitelist). Assert: chỉ relaxed_mode đổi — mọi cột
    // gamification/vai trò nguyên vẹn. Meta-test mutation (plan T4 Step 1):
    // thêm `xp: 999` vào .set → assert xp=50 phải ĐỎ → chứng minh test có sức
    // bắt (không tautology).
    sessionState.session = { user: { id: ID_A } };
    const result = await updateRelaxedMode(true);
    expect(result.ok).toBe(true);
    const [row] = await sql<{ relaxed_mode: boolean; xp: number; role: string; streak_count: number }[]>`
      SELECT relaxed_mode, xp, role, streak_count FROM profiles WHERE id = ${ID_A}
    `;
    expect(row.relaxed_mode).toBe(true);
    expect(row.xp).toBe(50); // fixture beforeAll — action KHÔNG được đụng
    expect(row.role).toBe("user");
    expect(row.streak_count).toBe(0);
    // dọn state: trả relaxed_mode về mặc định cho các run sau
    await sql`UPDATE profiles SET relaxed_mode = false WHERE id = ${ID_A}`;
  });
});

describe("ROLE admin — assertAdmin cho qua", () => {
  it("assertAdmin ALLOW admin (role re-check DB, không tin JWT)", async () => {
    sessionState.session = { user: { id: ID_ADMIN } };
    await expect(assertAdmin()).resolves.toBeUndefined();
  });
});

describe("TRIGGER-equivalent — invariant mọi users row có profiles row", () => {
  it("userC không profile bị invariant query bắt (events.createUser + register action là 2 path tạo profile)", async () => {
    const violations = await sql<{ id: string }[]>`
      SELECT u.id FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE p.id IS NULL
    `;
    // Fixture noprofile là vi phạm CHỦ ĐÍCH — chứng minh check bắt được drift;
    // mọi user thật (tạo qua register/OAuth) phải có profile → out của list này
    expect(violations.map((v) => v.id)).toEqual([ID_NOPROFILE]);
  });
});

describe("DB contract — UNIQUE + RESTRICT", () => {
  it("double-submit chặn: UNIQUE(user, part, client_attempt_id)", async () => {
    await expect(
      sql`
        INSERT INTO attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id)
        VALUES (${ID_A}, ${demoPartId}, 'typed', 0.9, 70, 0, 'aaaaaaaa-1111-4111-8111-111111111111')
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("daily_activity UNIQUE(user, date)", async () => {
    await sql`
      INSERT INTO daily_activity (user_id, date, parts_done) VALUES (${ID_A}, '2026-09-29', 1)
      ON CONFLICT DO NOTHING
    `;
    await expect(
      sql`
        INSERT INTO daily_activity (user_id, date, parts_done) VALUES (${ID_A}, '2026-09-29', 2)
      `,
    ).rejects.toMatchObject({ code: "23505" });
    await sql`DELETE FROM daily_activity WHERE user_id = ${ID_A} AND date = '2026-09-29'`;
  });

  it("DELETE RESTRICT: part đã có attempts không xóa được (23503 PG≤16 / 23001 PG17+) — quyết định #15", async () => {
    // QA-501: prod PG18.6 raise restrict_violation 23001, local PG16 raise
    // foreign_key_violation 23503 — assertion nhận cả 2 (superset, không yếu)
    const err = await sql`DELETE FROM lesson_parts WHERE id = ${demoPartId}`.catch(
      (e: { code?: string }) => e,
    );
    expect(["23503", "23001"]).toContain(err.code);
  });

  it("UNIQUE constraints tồn tại đúng spec §4", async () => {
    const names = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'u' AND conrelid IN (
        'units'::regclass, 'lessons'::regclass, 'lesson_parts'::regclass, 'attempts'::regclass
      )
    `;
    expect(names.map((n) => n.conname).sort()).toEqual(
      [
        "attempts_user_part_client_unique",
        "lesson_parts_lesson_id_sort_order_unique",
        "lessons_unit_id_number_unique",
        "units_book_id_number_unique",
      ].sort(),
    );
  });
});

describe("Leaderboard view — chỉ expose cột cho phép + XP tuần ISO đúng", () => {
  it("columns đúng bộ {scope, display_name, avatar_url, xp} — không id/email", async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leaderboard' ORDER BY column_name
    `;
    expect(cols.map((c) => c.column_name).sort()).toEqual(
      ["avatar_url", "display_name", "scope", "xp"].sort(),
    );
  });

  it("weekly = chỉ attempts trong tuần ISO hiện tại (race-immune: expected theo week-anchor query-time)", async () => {
    // Review vòng 2: KHÔNG có timestamp cố định sống sót qua week-crossing
    // (view dùng now() live). Nên expected được tính bằng CÙNG anchor:
    // - tuần chưa đổi giữa fixture-insert và assert (mọi case thực tế):
    //     userA weekly xp = 9 — chứng minh attempt -8 ngày KHÔNG bị cộng
    // - tuần VỪA đổi (~1e-7): cả 2 attempt đều ngoài tuần mới → userA vắng
    const [r] = await sql<{ same_week: boolean; weekly_xp: number | null }[]>`
      WITH wk AS (
        SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ws
      ),
      fx AS (
        SELECT date_trunc('week', MIN(a.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS ws
        FROM attempts a
        WHERE a.client_attempt_id = 'aaaaaaaa-1111-4111-8111-111111111111'
      )
      SELECT (wk.ws = fx.ws) AS same_week,
             (SELECT xp FROM leaderboard
              WHERE scope = 'weekly' AND display_name = 'RLS user') AS weekly_xp
      FROM wk, fx
    `;
    if (r.same_week) {
      expect(Number(r.weekly_xp)).toBe(9); // 9+3=12 nếu attempt tuần trước lộ vào
    } else {
      expect(r.weekly_xp).toBeNull();
    }
  });

  it("all_time từ profiles.xp; userB xp=0 không xuất hiện", async () => {
    const rows = await sql<{ display_name: string; xp: number }[]>`
      SELECT display_name, xp FROM leaderboard WHERE scope = 'all_time'
    `;
    const a = rows.find((r) => r.display_name === "RLS user");
    expect(a!.xp).toBe(50);
    expect(rows.find((r) => r.display_name === "RLS noprofile")).toBeUndefined();
    expect(rows.filter((r) => r.display_name === "RLS user")).toHaveLength(1);
  });
});

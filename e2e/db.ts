import postgres from "postgres";
import dotenv from "dotenv";

/**
 * DB helper cho e2e SF-6 — assert attempt rows / xp trực tiếp (ACCEPTANCE
 * "chỉ 1 attempt được ghi" cần đếm row, UI không thấy được). Read-only.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

/** Số attempt rows của (email, part) — bài demo L3-U1-L1, part theo sort_order. */
export async function attemptCount(
  email: string,
  partSortOrder: number,
): Promise<number> {
  const [row] = await client()`
    select count(*)::int as n
    from attempts a
    join users u on u.id = a.user_id
    join lesson_parts p on p.id = a.part_id
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    join books b on b.id = un.book_id
    where u.email = ${email}
      and b.slug = 'level-3' and un.number = 1 and l.number = 1
      and p.sort_order = ${partSortOrder}
  `;
  return row?.n ?? 0;
}

/** attempt count cho lesson BẤT KỲ (book slug + unit/lesson/sort numbers). */
export async function attemptCountFor(
  email: string,
  lessonNumber: number,
  partSortOrder: number,
  unitNumber = 1,
): Promise<number> {
  const [row] = await client()`
    select count(*)::int as n
    from attempts a
    join users u on u.id = a.user_id
    join lesson_parts p on p.id = a.part_id
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    join books b on b.id = un.book_id
    where u.email = ${email}
      and b.slug = 'level-3' and un.number = ${unitNumber}
      and l.number = ${lessonNumber} and p.sort_order = ${partSortOrder}
  `;
  return row?.n ?? 0;
}

/** profiles cache (xp, streak) theo email. */
export async function profileOf(
  email: string,
): Promise<{ xp: number; streak: number } | null> {
  const rows = await client()<[{ xp: number; streak: number }]>`
    select p.xp::int as xp, p.streak_count::int as streak
    from profiles p join users u on u.id = p.id
    where u.email = ${email}
  `;
  return rows[0] ?? null;
}

/** profiles meta (locale, display_name) — register edge SF-3 (locale theo route). */
export async function profileMetaOf(
  email: string,
): Promise<{ locale: string; displayName: string | null } | null> {
  const rows = await client()<[
    { locale: string; displayName: string | null },
  ]>`
    select p.locale::text as locale, p.display_name as "displayName"
    from profiles p join users u on u.id = p.id
    where u.email = ${email}
  `;
  return rows[0] ?? null;
}

/** Đếm user rows theo email — duplicate register không được tạo row thứ 2. */
export async function userCountByEmail(email: string): Promise<number> {
  const [row] = await client()`select count(*)::int as n from users where email = ${email}`;
  return row?.n ?? 0;
}

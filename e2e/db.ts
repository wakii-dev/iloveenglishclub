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

/**
 * Admin dashboard stats — nguồn SQL TRỰC TIẾP để đối chiếu UI (SF-4 QA,
 * ACCEPTANCE "dashboard đúng số liệu"). Read-only. Cùng định nghĩa với
 * getAdminDashboard() (src/lib/admin/queries.ts): users = count profiles,
 * newUsers7d theo profiles.created_at, parts/missing gộp toàn books.
 */
export type AdminStats = {
  lessons: number;
  publishedLessons: number;
  parts: number;
  partsMissingAudio: number;
  users: number;
  newUsers7d: number;
  books: {
    slug: string;
    title: string;
    units: number;
    lessons: number;
    published: number;
    parts: number;
    missing: number;
  }[];
};

export async function adminStats(): Promise<AdminStats> {
  const [totals] = await client()<[
    {
      lessons: number;
      published: number;
      parts: number;
      missing: number;
      users: number;
      new7d: number;
    },
  ]>`
    select
      (select count(*)::int from lessons) as lessons,
      (select count(*)::int from lessons where published) as published,
      (select count(*)::int from lesson_parts) as parts,
      (select count(*)::int from lesson_parts where audio_path is null) as missing,
      (select count(*)::int from profiles) as users,
      (select count(*)::int from profiles where created_at > now() - interval '7 days') as "new7d"
  `;
  const bookRows = await client()<[
    {
      slug: string;
      title: string;
      units: number;
      lessons: number;
      published: number;
      parts: number;
      missing: number;
    },
  ]>`
    select b.slug,
           coalesce(b.title_vi, b.title_en) as title,
           (select count(*)::int from units un where un.book_id = b.id) as units,
           (select count(*)::int from lessons l join units un on un.id = l.unit_id where un.book_id = b.id) as lessons,
           (select count(*)::int from lessons l join units un on un.id = l.unit_id where un.book_id = b.id and l.published) as published,
           (select count(*)::int from lesson_parts p join lessons l on l.id = p.lesson_id join units un on un.id = l.unit_id where un.book_id = b.id) as parts,
           (select count(*)::int from lesson_parts p join lessons l on l.id = p.lesson_id join units un on un.id = l.unit_id where un.book_id = b.id and p.audio_path is null) as missing
    from books b
    order by b.sort_order
  `;
  return {
    lessons: totals?.lessons ?? 0,
    publishedLessons: totals?.published ?? 0,
    parts: totals?.parts ?? 0,
    partsMissingAudio: totals?.missing ?? 0,
    users: totals?.users ?? 0,
    newUsers7d: totals?.new7d ?? 0,
    books: bookRows,
  };
}

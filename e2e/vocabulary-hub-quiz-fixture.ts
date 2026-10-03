import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite hub quiz tổng (story vocabulary-hub SF-3 t-3.3) — pattern
 * vocabulary-hub-fixture.ts. Words qa-hub-* tái dùng fixture hub
 * (ensureHubWordsFixture/cleanupHubFixture — seed + cascade dọn giống hệt);
 * ĐIỀU KIỆN RIÊNG suite này: quiz_attempts phải có VÀ book_id nullable
 * (migration 0003) vì quiz tổng scope all/multi lưu attempt book_id NULL —
 * thiếu thì globalSetup fail rõ kèm hướng dẫn, suite KHÔNG chạy trên DB nửa
 * vời.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

/** Gate migration 0003: quiz_attempts tồn tại + book_id nullable. */
export async function ensureQuizAttemptsNullable(): Promise<void> {
  const c = client();
  const rows: { qa: string | null; nullable: string | null }[] = await c`
    select to_regclass('quiz_attempts') as qa,
           (select is_nullable from information_schema.columns
             where table_name = 'quiz_attempts' and column_name = 'book_id'
           ) as nullable
  `;
  const row = rows[0];
  if (!row?.qa || row.nullable !== "YES") {
    throw new Error(
      "quiz_attempts chưa tồn tại hoặc quiz_attempts.book_id chưa nullable — áp dụng migration 0003 (npx drizzle-kit migrate) trước khi chạy suite hub quiz tổng: quiz tổng scope all/multi lưu attempt với book_id NULL (SF-3 t-3.2)",
    );
  }
}

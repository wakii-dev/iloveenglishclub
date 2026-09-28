import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Neon Postgres qua postgres.js (pooled endpoint):
 * - `prepare: false` — PgBouncer transaction mode không hỗ trợ prepared statements
 * - globalThis singleton — tránh mở kết nối mới mỗi lần hot-reload ở dev
 *   (tiết kiệm connection limit của Neon)
 * - URL placeholder chỉ để module import an toàn lúc build (CI không có env) —
 *   postgres.js không connect tới khi query đầu tiên
 */
const globalForDb = globalThis as unknown as { __ilecSql?: postgres.Sql };

function sql(): postgres.Sql {
  globalForDb.__ilecSql ??= postgres(
    process.env.DATABASE_URL ??
      "postgres://placeholder:placeholder@localhost:5432/placeholder",
    { prepare: false },
  );
  return globalForDb.__ilecSql;
}

export const db = drizzle(sql(), { schema });

/**
 * Postgres error code extraction (SF-5 actions) — Drizzle bọc PgError trong
 * DrizzleQueryError (code ở .cause) hoặc để .code trên thân (pattern đã dùng
 * ở registerAction). Trả mã PG (23505 unique, 23503 restrict) hoặc null.
 */
export function pgErrorCode(error: unknown): string | null {
  const direct = (error as { code?: string })?.code;
  if (direct) return direct;
  return (error as { cause?: { code?: string } })?.cause?.code ?? null;
}

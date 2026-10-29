import postgres from "postgres";
import dotenv from "dotenv";
import { ensureHubWordsFixture } from "./vocabulary-hub-fixture";

/**
 * GlobalSetup smoke v2 (migrate SF4): assert bảng cốt lõi có (migration đã
 * chạy) + books demo (seed.ts) + seed words qa-hub-* TRƯỚC webServer —
 * pattern vocabulary-hub-global-setup.ts của ilec gốc. Fail RÕ kèm hướng
 * dẫn nếu DB chưa setup, không giả lập DB nửa vời.
 */
dotenv.config({ path: ".env.local" });

export default async function smokeGlobalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error(
      "DATABASE_URL trống — tạo .env.local (xem .env.example / setup-db) trước khi chạy smoke",
    );
  }
  const sql = postgres(url, { prepare: false });
  try {
    const tables = await sql`
      select to_regclass('words') as w, to_regclass('books') as b,
             to_regclass('lessons') as l, to_regclass('users') as u
    `;
    const missing = (
      ["w", "b", "l", "u"] as const
    ).filter((k) => !tables[0]?.[k]);
    if (missing.length > 0) {
      throw new Error(
        `bảng chưa tồn tại (${missing.join(", ")}) — chạy \`npx drizzle-kit migrate\` trước khi chạy smoke`,
      );
    }
    const books = await sql`
      select slug from books where slug in ('level-1', 'level-3')
    `;
    const slugs = books.map((r) => r.slug).sort();
    if (!slugs.includes("level-1") || !slugs.includes("level-3")) {
      throw new Error(
        "books level-1/level-3 chưa có — chạy `node scripts/seed.ts` trước khi chạy smoke",
      );
    }
  } finally {
    await sql.end();
  }
  await ensureHubWordsFixture();
}

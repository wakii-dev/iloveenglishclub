import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite word-lookup popover (story vocabulary-module SF-5 t-5.3) —
 * pattern vocabulary-quiz-fixture.ts (SF-4). Seed idempotent từ "football" (có
 * SẴN trong transcript bài demo level-3/u1/l1 — "I play football with my
 * friends every Saturday.") vào book level-3 với meaning QA ĐỘC NHẤN để popover
 * assert. Upsert theo nghĩa QA: nếu teacher đã có "football" nghĩa khác thì
 * KHÔNG đụng (teardown cũng chỉ xoá row nghĩa QA). Teardown xoá word QA
 * (cascade book_words). GATE (như SF-2/3/4, không giả lập DB): bảng words /
 * book_words phải đã có (migration 0002) — thiếu thì globalSetup fail rõ kèm
 * hướng dẫn.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const LOOKUP_BOOK_SLUG = "level-3";

/** Nhận diện row QA — seed/teardown/assert cùng dùng, chạm nhầm data thật. */
export const LOOKUP_QA_MEANING = "từ QA lookup (bóng đá)";

export const LOOKUP_WORD = "football";

export async function ensureLookupFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw
  `;
  if (!tables[0]?.w || !tables[0]?.bw) {
    throw new Error(
      "bảng words / book_words chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite word-lookup",
    );
  }
  const books: { id: number }[] = await c`
    select id from books where slug = ${LOOKUP_BOOK_SLUG}
  `;
  const book = books[0];
  if (!book) throw new Error(`book ${LOOKUP_BOOK_SLUG} không tồn tại — DB template sai`);
  await c.begin(async (tx) => {
    const inserted: { id: number }[] = await tx`
      insert into words (word, ipa, meaning_vi, example, audio_url)
      values (${LOOKUP_WORD}, ${"ˈfʊtbɔːl"}, ${LOOKUP_QA_MEANING},
              ${"I play football with my friends every Saturday."},
              ${"https://cdn.example.com/qa-lookup-football.mp3"})
      on conflict (word) do update set meaning_vi = excluded.meaning_vi
      where words.meaning_vi = ${LOOKUP_QA_MEANING}
      returning id
    `;
    if (inserted.length === 0) return; // đã có "football" nghĩa khác — không đụng
    await tx`
      insert into book_words (book_id, word_id, "order")
      select ${book.id}, ${inserted[0]!.id}, coalesce(max("order"), 0) + 1
      from book_words where book_id = ${book.id}
      on conflict (book_id, word_id) do nothing
    `;
  });
}

/** Self-clean cuối run — chỉ xoá row "football" mang nghĩa QA của suite này. */
export async function cleanupLookupFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  await c`
    delete from words
    where word = ${LOOKUP_WORD} and meaning_vi = ${LOOKUP_QA_MEANING}
  `;
}

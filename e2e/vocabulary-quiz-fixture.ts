import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite quiz flow (story vocabulary-module SF-4 t-4.4) — pattern
 * vocabulary-review-fixture.ts (SF-3). 20 từ QA prefix `qa-quiz-*` seed vào
 * book level-4 bởi globalSetup (đề đầy đủ 10 câu cần >= 18 từ). User đăng ký
 * qua UI; quiz_attempts do flow tự ghi khi nộp bài. Teardown xoá words QA
 * (cascade book_words) + quiz_attempts của user qa-quiz-*.
 *
 * GATE (như SF-2/3, không giả lập DB): bảng words / book_words / quiz_attempts
 * phải đã có (migration 0002) — thiếu thì globalSetup fail rõ kèm hướng dẫn.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const QUIZ_BOOK_SLUG = "level-4";

export const QUIZ_WORD_COUNT = 20;

export async function ensureQuizWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('quiz_attempts') as qa
  `;
  if (!tables[0]?.w || !tables[0]?.bw || !tables[0]?.qa) {
    throw new Error(
      "bảng words / book_words / quiz_attempts chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite quiz flow",
    );
  }
  const books: { id: number }[] = await c`
    select id from books where slug = ${QUIZ_BOOK_SLUG}
  `;
  const book = books[0];
  if (!book) throw new Error(`book ${QUIZ_BOOK_SLUG} không tồn tại — DB template sai`);
  await c.begin(async (tx) => {
    for (let i = 1; i <= QUIZ_WORD_COUNT; i++) {
      const word = `qa-quiz-${String(i).padStart(2, "0")}`;
      const inserted: { id: number }[] = await tx`
        insert into words (word, ipa, meaning_vi, example, audio_url)
        values (${word}, null, ${`từ QA quiz ${i}`}, null, null)
        on conflict (word) do nothing
        returning id
      `;
      if (inserted.length === 0) continue; // đã có từ lần chạy trước — giữ nguyên
      const [maxRow] = await tx`
        select coalesce(max("order"), 0)::int as max
        from book_words where book_id = ${book.id}
      `;
      await tx`
        insert into book_words (book_id, word_id, "order")
        values (${book.id}, ${inserted[0]!.id}, ${(maxRow?.max ?? 0) + 1})
        on conflict (book_id, word_id) do nothing
      `;
    }
  });
}

/** Self-clean cuối run — xoá điểm quiz QA + words QA (cascade book_words). */
export async function cleanupQuizFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('quiz_attempts') as qa, to_regclass('words') as w`;
  if (!tables[0]?.qa) return;
  await c`
    delete from quiz_attempts
    where user_id in (select id from users where email like 'qa-quiz-%')
  `;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-quiz-%'`;
}

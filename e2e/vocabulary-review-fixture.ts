import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite review flow (story vocabulary-module SF-3 t-3.3) — pattern
 * vocabulary-fixture.ts (SF-2). 2 từ QA prefix `qa-review-*` seed bởi
 * globalSetup; user_word_progress do SPEC tự seed giữa test (user đăng ký qua
 * UI, email truyền vào seedDueProgress — due_at = now() - 1h). Teardown xoá
 * words (cascade book_words + user_word_progress).
 *
 * GATE (như SF-2, không giả lập DB): bảng words / user_word_progress phải đã
 * có (migration 0002) — thiếu thì globalSetup fail rõ kèm hướng dẫn, suite
 * KHÔNG chạy trên DB nửa vời.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const REVIEW_BOOK_SLUG = "level-3";

export const REVIEW_WORDS = [
  {
    word: "qa-review-alpha",
    ipa: "ˈælfə",
    meaning: "từ QA review alpha",
    example: "Alpha is the first QA review word.",
    audio: null,
  },
  {
    word: "qa-review-bravo",
    ipa: "ˈbrɑːvəʊ",
    meaning: "từ QA review bravo",
    example: null,
    audio: null,
  },
] as const;

export async function ensureReviewWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('user_word_progress') as uwp
  `;
  if (!tables[0]?.w || !tables[0]?.uwp) {
    throw new Error(
      "bảng words / user_word_progress chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite review flow",
    );
  }
  const books: { id: number }[] = await c`
    select id from books where slug = ${REVIEW_BOOK_SLUG}
  `;
  const book = books[0];
  if (!book) throw new Error(`book ${REVIEW_BOOK_SLUG} không tồn tại — DB template sai`);
  await c.begin(async (tx) => {
    for (const w of REVIEW_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, ipa, meaning_vi, example, audio_url)
        values (${w.word}, ${w.ipa}, ${w.meaning}, ${w.example}, ${w.audio})
        on conflict (word) do update set ipa = excluded.ipa
        returning id
      `;
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

/** Seed progress đến hạn cho user (đăng ký qua UI trước đó) — due 1 giờ trước. */
export async function seedDueProgress(email: string): Promise<void> {
  const c = client();
  const users: { id: string }[] = await c`
    select id from users where email = ${email}
  `;
  const user = users[0];
  if (!user) throw new Error(`user ${email} chưa đăng ký — spec phải register trước`);
  for (const w of REVIEW_WORDS) {
    await c`
      insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
      select ${user.id}, id, 2.5, 0, now() - interval '1 hour', 0
      from words where word = ${w.word}
      on conflict (user_id, word_id) do update set
        due_at = now() - interval '1 hour', ease = 2.5, interval_days = 0, reps = 0
    `;
  }
}

/** Self-clean cuối run — xoá words QA (cascade progress + book_words). */
export async function cleanupReviewFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  const names = REVIEW_WORDS.map((w) => w.word);
  await c`delete from words where word = any(${names})`;
}

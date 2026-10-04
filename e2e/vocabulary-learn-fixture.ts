import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite vocabulary learn (story vocabulary-learn sf-1) — pattern
 * vocabulary-hub-fixture.ts. 12 từ QA `qa-learn-*` seed vào book level-1 bởi
 * globalSetup: đủ để khẳng định stagger 5 từ/ngày (t-1.2) → 5 hôm nay +
 * 5 ngày mai + 2 ngày kề. user_word_progress KHÔNG seed sẵn — do flow tự sinh
 * (nút bulk seed/bấm thẻ). Teardown xoá words (cascade book_words +
 * user_word_progress).
 *
 * GATE (như các suite vocabulary trước): bảng words / book_words /
 * user_word_progress phải có (migration 0002) — thiếu thì globalSetup fail rõ
 * kèm hướng dẫn, suite KHÔNG chạy trên DB nửa vời.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const LEARN_BOOK_SLUG = "level-1";

/** 12 từ — > 10 để stagger 5/ngày cho ≥3 nhóm ngày khác nhau. */
export const LEARN_WORDS: readonly {
  word: string;
  ipa: null;
  meaning: string;
}[] = Array.from({ length: 12 }, (_, i) => ({
  word: `qa-learn-${String(i).padStart(2, "0")}`,
  ipa: null,
  meaning: `từ QA learn ${i}`,
}));

export async function ensureLearnWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('user_word_progress') as uwp
  `;
  if (!tables[0]?.w || !tables[0]?.bw || !tables[0]?.uwp) {
    throw new Error(
      "bảng words / book_words / user_word_progress chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite vocabulary learn",
    );
  }
  await c.begin(async (tx) => {
    const bookRows: { id: number }[] = await tx`
      select id from books where slug = ${LEARN_BOOK_SLUG}
    `;
    const book = bookRows[0];
    if (!book) {
      throw new Error(`book ${LEARN_BOOK_SLUG} không tồn tại — DB template sai`);
    }
    for (const w of LEARN_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, meaning_vi)
        values (${w.word}, ${w.meaning})
        on conflict (word) do update set meaning_vi = excluded.meaning_vi
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

/** Self-clean cuối run — xoá words QA (cascade book_words + progress). */
export async function cleanupLearnFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-learn-%'`;
}

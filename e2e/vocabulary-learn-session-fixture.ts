import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite learn-session (vocab-memrise SF-3, VU-40) — pattern
 * vocabulary-learn-fixture.ts (qa-learn-book). Book QA RIÊNG `qa-ls-book`
 * (id 9904) + 12 từ `qa-ls-*` CÓ audio (URL cdn mẫu — play() fail mềm, step
 * vẫn render) + nghĩa PHÂN BIỆT (MC đủ 4 lựa chọn) seed bởi globalSetup.
 * user_word_progress KHÔNG seed — flow UI tự sinh qua POST session (SF-2).
 * Teardown xoá words QA (cascade book_words + progress) + book QA.
 *
 * GATE (như các suite vocabulary trước): bảng words / book_words /
 * user_word_progress / vocab_activity phải có (migration 0002+) — thiếu thì
 * globalSetup fail rõ, suite KHÔNG chạy trên DB nửa vời.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const LS_BOOK_SLUG = "qa-ls-book";
export const LS_BOOK_ID = 9904;

/** 12 từ — > 10 để level 1 (chunk 10) có dư cho reload test (còn 3 unplanted). */
export const LS_WORDS: readonly { word: string; meaning: string }[] =
  Array.from({ length: 12 }, (_, i) => ({
    word: `qa-ls-${String(i + 1).padStart(2, "0")}`,
    meaning: `nghĩa LS ${i + 1}`,
  }));

export async function ensureLearnSessionFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('user_word_progress') as uwp,
           to_regclass('vocab_activity') as va
  `;
  if (!tables[0]?.w || !tables[0]?.bw || !tables[0]?.uwp || !tables[0]?.va) {
    throw new Error(
      "bảng words / book_words / user_word_progress / vocab_activity chưa tồn tại — áp dụng migration vocab-memrise (SF-1) trước khi chạy suite learn-session",
    );
  }
  await c.begin(async (tx) => {
    await tx`
      insert into books (id, slug, title_en, cefr_label, color, sort_order)
      values (${LS_BOOK_ID}, ${LS_BOOK_SLUG}, 'QA Learn Session Book', 'B1', '#2563eb', 9998)
      on conflict do nothing
    `;
    for (const w of LS_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, meaning_vi, audio_url)
        values (${w.word}, ${w.meaning}, ${`https://cdn.example.com/audio/${w.word}.mp3`})
        on conflict (word) do update set meaning_vi = excluded.meaning_vi
        returning id
      `;
      const [maxRow] = await tx`
        select coalesce(max("order"), 0)::int as max
        from book_words where book_id = ${LS_BOOK_ID}
      `;
      await tx`
        insert into book_words (book_id, word_id, "order")
        values (${LS_BOOK_ID}, ${inserted[0]!.id}, ${(maxRow?.max ?? 0) + 1})
        on conflict (book_id, word_id) do nothing
      `;
    }
  });
}

/** Self-clean cuối run — xoá words QA + book QA (cascade assignments/progress). */
export async function cleanupLearnSessionFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w, to_regclass('books') as b`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-ls-%'`;
  if (tables[0]?.b) {
    await c`delete from books where id = ${LS_BOOK_ID}`;
  }
}

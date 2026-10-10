import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite vocabulary hub (story vocabulary-hub SF-1 t-1.3) — pattern
 * vocabulary-review-fixture.ts. 3 từ QA `qa-hub-*` seed vào 2 book (level-3,
 * level-1) bởi globalSetup; user_word_progress do SPEC tự seed giữa test
 * (seedHubProgress theo email user đăng ký qua UI): alpha DUE (1h trước,
 * reps 0) · bravo MASTERED (reps 3, due +7 ngày) · charlie LEARNING (reps 0,
 * due +2 ngày) → KPI kỳ vọng 3/1/1. Teardown xoá words (cascade book_words +
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

export const HUB_WORDS = [
  {
    word: "qa-hub-alpha",
    ipa: "ˈælfə",
    meaning: "từ QA hub alpha",
    book: "level-3",
  },
  {
    word: "qa-hub-bravo",
    ipa: "ˈbrɑːvəʊ",
    meaning: "từ QA hub bravo",
    book: "level-3",
  },
  {
    word: "qa-hub-charlie",
    ipa: "ˈtʃɑːli",
    meaning: "từ QA hub charlie",
    book: "level-1",
  },
] as const;

export async function ensureHubWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('user_word_progress') as uwp
  `;
  if (!tables[0]?.w || !tables[0]?.bw || !tables[0]?.uwp) {
    throw new Error(
      "bảng words / book_words / user_word_progress chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite vocabulary hub",
    );
  }
  await c.begin(async (tx) => {
    for (const w of HUB_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, ipa, meaning_vi, example, audio_url)
        values (${w.word}, ${w.ipa}, ${w.meaning}, null, null)
        on conflict (word) do update set ipa = excluded.ipa
        returning id
      `;
      const bookRows: { id: number }[] = await tx`
        select id from books where slug = ${w.book}
      `;
      const book = bookRows[0];
      if (!book) {
        throw new Error(`book ${w.book} không tồn tại — DB template sai`);
      }
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

/**
 * Bulk từ ĐỘC LẬP (SF-2 t-2.3) — prefix `qa-lib-*`, không gắn book_words:
 * 55 từ đẩy total tab Thư viện > 50 → pagination thật (page 2) + cột Sách
 * "—". Spec tự cleanup sau run (afterAll) — global teardown chỉ dọn qa-hub-*.
 */
export const LIBRARY_BULK_COUNT = 55;
export const LIBRARY_BULK_PREFIX = "qa-lib-";

export async function seedLibraryBulkWords(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) {
    throw new Error(
      "bảng words chưa tồn tại — áp dụng migration trước khi chạy suite vocabulary hub",
    );
  }
  await c`
    insert into words (word, meaning_vi)
    select ${LIBRARY_BULK_PREFIX} || lpad(g::text, 3, '0'), 'từ QA lib ' || g
    from generate_series(1, ${LIBRARY_BULK_COUNT}) as g
    on conflict (word) do nothing
  `;
}

export async function cleanupLibraryBulkWords(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like ${LIBRARY_BULK_PREFIX + "%"}`;
}

/** Seed 3 trạng thái SRS cho user (đăng ký qua UI trước đó — theo email). */
export async function seedHubProgress(email: string): Promise<void> {
  const c = client();
  const users: { id: string }[] = await c`
    select id from users where email = ${email}
  `;
  const user = users[0];
  if (!user) throw new Error(`user ${email} chưa đăng ký — spec phải register trước`);

  // alpha: DUE — due 1 giờ trước, chưa ôn lần nào
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
    select ${user.id}, id, 2.5, 0, now() - interval '1 hour', 0
    from words where word = ${HUB_WORDS[0].word}
    on conflict (user_id, word_id) do update set
      due_at = now() - interval '1 hour', ease = 2.5, interval_days = 0, reps = 0
  `;
  // bravo: MASTERED — 3 lần ôn thành công, due xa (7 ngày)
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
    select ${user.id}, id, 2.5, 15, now() + interval '7 days', 3
    from words where word = ${HUB_WORDS[1].word}
    on conflict (user_id, word_id) do update set
      due_at = now() + interval '7 days', ease = 2.5, interval_days = 15, reps = 3
  `;
  // charlie: LEARNING — mới thêm, chưa đến hạn
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
    select ${user.id}, id, 2.5, 0, now() + interval '2 days', 0
    from words where word = ${HUB_WORDS[2].word}
    on conflict (user_id, word_id) do update set
      due_at = now() + interval '2 days', ease = 2.5, interval_days = 0, reps = 0
  `;
}

/** Self-clean cuối run — xoá words QA (cascade book_words + progress). */
export async function cleanupHubFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  const names = HUB_WORDS.map((w) => w.word);
  await c`delete from words where word = any(${names})`;
}

/** Tổng số hàng bảng words HIỆN TẠI — test pagination dùng expected ĐỘNG
 * (SF-5 convergence: DB template còn 6 từ demo non-qa — không hardcode). */
export async function countAllWords(): Promise<number> {
  const c = client();
  const rows: { n: number }[] = await c`select count(*)::int as n from words`;
  return rows[0]?.n ?? 0;
}

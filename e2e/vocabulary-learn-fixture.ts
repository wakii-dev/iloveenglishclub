import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite vocabulary learn (story vocabulary-learn sf-1) — pattern
 * vocabulary-hub-fixture.ts. Book QA RIÊNG `qa-learn-book` (id 9901) + 12 từ
 * `qa-learn-*` seed bởi globalSetup: count từ chưa học TẤT ĐỊNH = 12 (không
 * dính từ template của book thật) — đủ cho stagger 5 từ/ngày (t-1.2) → 5 hôm
 * nay + 5 ngày mai + 2 ngày kề. user_word_progress KHÔNG seed sẵn — do flow
 * tự sinh (nút bulk seed/bấm thẻ); seedDailyPlanProgress(email) riêng cho
 * test lộ trình t-1.5 (5 mới due + 3 ôn due + 4 chưa đến hạn, streak 2 ngày
 * VN). Teardown xoá words QA (cascade book_words + progress) + book QA
 * (cascade book_words).
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

/** Book QA riêng — count từ chưa học tất định, không đụng book thật. */
export const LEARN_BOOK_SLUG = "qa-learn-book";
export const LEARN_BOOK_ID = 9901;

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
    await tx`
      insert into books (id, slug, title_en, cefr_label, color, sort_order)
      values (${LEARN_BOOK_ID}, ${LEARN_BOOK_SLUG}, 'QA Learn Book', 'A1', '#2563eb', 9999)
      on conflict do nothing
    `;
    const bookRows: { id: number }[] = await tx`
      select id from books where slug = ${LEARN_BOOK_SLUG}
    `;
    const book = bookRows[0];
    if (!book) {
      throw new Error(
        `book ${LEARN_BOOK_SLUG} không tạo được — check constraint books`,
      );
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

/**
 * Seed lộ trình TẤT ĐỊNH cho user (đăng ký qua UI trước đó — theo email) phục
 * vụ test t-1.5: 5 từ MỚI due (reps 0, due 1h trước) + 3 từ ÔN due (reps 2,
 * đã ôn hôm qua — hôm nay đến hạn lại) + 2 từ đã học hôm nay/hôm qua (streak
 * 2 ngày VN — due tương lai) + 2 từ chưa đến hạn → kỳ vọng "5 new words · 3
 * words to review", "2-day streak". last_reviewed_at chỉ phủ 2 ngày distinct
 * (hôm nay + hôm qua) — ngày khác sẽ kéo streak lệch kỳ vọng.
 */
export async function seedDailyPlanProgress(email: string): Promise<void> {
  const c = client();
  const users: { id: string }[] = await c`
    select id from users where email = ${email}
  `;
  const user = users[0];
  if (!user) throw new Error(`user ${email} chưa đăng ký — spec phải register trước`);
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps, last_reviewed_at)
    select ${user.id}, id, 2.5, 0, now() - interval '1 hour', 0, null
    from words
    where word in ('qa-learn-01', 'qa-learn-02', 'qa-learn-03', 'qa-learn-04', 'qa-learn-05')
    on conflict (user_id, word_id) do update set
      due_at = now() - interval '1 hour', ease = 2.5, interval_days = 0,
      reps = 0, last_reviewed_at = null
  `;
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps, last_reviewed_at)
    select ${user.id}, id, 2.5, 1, now() - interval '1 hour', 2,
           now() - interval '1 day'
    from words
    where word in ('qa-learn-06', 'qa-learn-07', 'qa-learn-08')
    on conflict (user_id, word_id) do update set
      due_at = now() - interval '1 hour', ease = 2.5, interval_days = 1,
      reps = 2, last_reviewed_at = now() - interval '1 day'
  `;
  // 2 từ đóng streak: ôn hôm nay + hôm qua (due tương lai — không đếm due).
  // DO UPDATE SET không thấy cột bảng nguồn — lấy giá trị đã tính qua excluded
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps, last_reviewed_at)
    select ${user.id}, id, 2.5, 1, now() + interval '1 day', 1,
           case when word = 'qa-learn-09' then now() else now() - interval '1 day' end
    from words
    where word in ('qa-learn-09', 'qa-learn-10')
    on conflict (user_id, word_id) do update set
      due_at = excluded.due_at, ease = 2.5, interval_days = 1,
      reps = 1, last_reviewed_at = excluded.last_reviewed_at
  `;
  // 2 từ chưa đến hạn (queue những ngày tới)
  await c`
    insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps, last_reviewed_at)
    select ${user.id}, id, 2.5, 0,
           now() + (case when word = 'qa-learn-11' then interval '1 day' else interval '2 days' end),
           0, null
    from words
    where word in ('qa-learn-11', 'qa-learn-12')
    on conflict (user_id, word_id) do update set
      due_at = excluded.due_at, ease = 2.5, interval_days = 0,
      reps = 0, last_reviewed_at = excluded.last_reviewed_at
  `;
}

/** Self-clean cuối run — xoá words QA + book QA (cascade assignments/progress). */
export async function cleanupLearnFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w, to_regclass('books') as b`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-learn-%'`;
  if (tables[0]?.b) {
    await c`delete from books where id = ${LEARN_BOOK_ID}`;
  }
}

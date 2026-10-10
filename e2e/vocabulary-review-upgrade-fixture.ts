import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite review-upgrade (vocab-memrise SF-3, VU-40) — pattern
 * vocabulary-review-fixture.ts (3311, nghỉ hưu). Book QA RIÊNG `qa-ru-book`
 * (id 9905) + 4 từ `qa-ru-*` nghĩa PHÂN BIỆT (qa-ru-02 CÓ audio → review
 * listen-first; còn lại không audio → mc-first) seed bởi globalSetup; do_at
 * do SPEC tự seed giữa test (seedDueProgress — due 1h trước, reps 2). Thêm
 * `qa-ru-xtra` DUE nhưng KHÔNG thuộc book cho test scope=book. Teardown xoá
 * words QA (cascade progress) + book QA.
 *
 * GATE: bảng words / user_word_progress / vocab_activity phải có — thiếu thì
 * globalSetup fail rõ, suite KHÔNG chạy trên DB nửa vời.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const RU_BOOK_SLUG = "qa-ru-book";
export const RU_BOOK_ID = 9905;

export const RU_WORDS: readonly {
  word: string;
  meaning: string;
  audio: string | null;
}[] = [
  { word: "qa-ru-01", meaning: "nghĩa RU 1", audio: null },
  {
    word: "qa-ru-02",
    meaning: "nghĩa RU 2",
    audio: "https://cdn.example.com/audio/qa-ru-02.mp3",
  },
  { word: "qa-ru-03", meaning: "nghĩa RU 3", audio: null },
  { word: "qa-ru-04", meaning: "nghĩa RU 4", audio: null },
];

const XTRA = { word: "qa-ru-xtra", meaning: "nghĩa RU ngoài sách" };

export async function ensureReviewUpgradeFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('user_word_progress') as uwp,
           to_regclass('vocab_activity') as va
  `;
  if (!tables[0]?.w || !tables[0]?.uwp || !tables[0]?.va) {
    throw new Error(
      "bảng words / user_word_progress / vocab_activity chưa tồn tại — áp dụng migration vocab-memrise (SF-1) trước khi chạy suite review-upgrade",
    );
  }
  await c.begin(async (tx) => {
    await tx`
      insert into books (id, slug, title_en, cefr_label, color, sort_order)
      values (${RU_BOOK_ID}, ${RU_BOOK_SLUG}, 'QA Review Upgrade Book', 'A2', '#2563eb', 9997)
      on conflict do nothing
    `;
    for (const w of RU_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, meaning_vi, audio_url)
        values (${w.word}, ${w.meaning}, ${w.audio})
        on conflict (word) do update set meaning_vi = excluded.meaning_vi
        returning id
      `;
      const [maxRow] = await tx`
        select coalesce(max("order"), 0)::int as max
        from book_words where book_id = ${RU_BOOK_ID}
      `;
      await tx`
        insert into book_words (book_id, word_id, "order")
        values (${RU_BOOK_ID}, ${inserted[0]!.id}, ${(maxRow?.max ?? 0) + 1})
        on conflict (book_id, word_id) do nothing
      `;
    }
    await tx`
      insert into words (word, meaning_vi, audio_url)
      values (${XTRA.word}, ${XTRA.meaning}, null)
      on conflict (word) do update set meaning_vi = excluded.meaning_vi
    `;
  });
}

/** Seed progress ĐẾN HẠN cho user (đăng ký qua UI trước đó) — due 1h trước, reps 2. */
export async function seedDueProgress(
  email: string,
  words: readonly string[] = RU_WORDS.map((w) => w.word),
): Promise<void> {
  const c = client();
  const users: { id: string }[] = await c`
    select id from users where email = ${email}
  `;
  const user = users[0];
  if (!user) throw new Error(`user ${email} chưa đăng ký — spec phải register trước`);
  for (const word of words) {
    await c`
      insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps, lapses)
      select ${user.id}, id, 2.5, 1, now() - interval '1 hour', 2, 0
      from words where word = ${word}
      on conflict (user_id, word_id) do update set
        due_at = now() - interval '1 hour', ease = 2.5, interval_days = 1,
        reps = 2, lapses = 0
    `;
  }
}

/** Seed thêm từ due NGOÀI sách (scope=book phải lọc ra). */
export async function seedExtraDueWord(email: string): Promise<void> {
  await seedDueProgress(email, [XTRA.word]);
}

export async function wordIdOf(word: string): Promise<number> {
  const c = client();
  const rows: { id: number }[] = await c`
    select id from words where word = ${word}
  `;
  if (!rows[0]) throw new Error(`word ${word} không tồn tại — fixture sai`);
  return rows[0].id;
}

/** 1 dòng progress của (user, word) — assert due_at/reps/lapses sau flow. */
export async function progressRow(
  email: string,
  word: string,
): Promise<{ reps: number; lapses: number; dueAt: Date } | null> {
  const c = client();
  const rows: { reps: number; lapses: number; due_at: Date }[] = await c`
    select p.reps, p.lapses, p.due_at
    from user_word_progress p
    join users u on u.id = p.user_id
    join words w on w.id = p.word_id
    where u.email = ${email} and w.word = ${word}
  `;
  const row = rows[0];
  return row ? { reps: row.reps, lapses: row.lapses, dueAt: row.due_at } : null;
}

/** Số activity row của 1 bước (word, stepIndex) MỌI attempt — double-submit chỉ được 1. */
export async function countStepActivities(
  email: string,
  word: string,
  stepIndex: number,
): Promise<number> {
  const c = client();
  const rows: { n: number }[] = await c`
    select count(*)::int as n
    from vocab_activity a
    join users u on u.id = a.user_id
    join words w on w.id = a.word_id
    where u.email = ${email} and w.word = ${word}
      and a.step_index = ${stepIndex} and a.kind = 'session-step'
  `;
  return rows[0]?.n ?? 0;
}

/** Self-clean cuối run — xoá words QA + book QA (cascade assignments/progress). */
export async function cleanupReviewUpgradeFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w, to_regclass('books') as b`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-ru-%'`;
  if (tables[0]?.b) {
    await c`delete from books where id = ${RU_BOOK_ID}`;
  }
}

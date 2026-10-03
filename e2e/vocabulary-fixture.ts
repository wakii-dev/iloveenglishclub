import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite vocabulary public (story vocabulary-module SF-2 t-2.3) —
 * pattern sf2-db.ts: seed idempotent TRƯỚC webServer (unstable_cache `content`
 * lần đầu query thấy fixture), teardown xoá sạch. 2 từ QA prefix `qa-vocab-*`
 * (tránh đụng data teacher): 1 CÓ audio_url (nút phát hiện) + 1 KHÔNG (nút
 * ẩn) — contract t-2.2. audio_url example.com không phát thật được — suite
 * assert nút/audio element, KHÔNG click play (playback thật là việc admin
 * upload file thật, đã phủ ở suite admin SF-1).
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const VOCAB_BOOK_SLUG = "level-3";

export const FIXTURE_WORDS = [
  {
    word: "qa-vocab-audio",
    ipa: "kwɔː",
    meaning: "từ QA có audio",
    example: "This QA word has audio.",
    audio: "https://cdn.example.com/qa-vocab-audio.mp3",
  },
  {
    word: "qa-vocab-noaudio",
    ipa: null,
    meaning: "từ QA không audio",
    example: null,
    audio: null,
  },
] as const;

export async function ensureVocabularyFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w, to_regclass('book_words') as bw`;
  if (!tables[0]?.w || !tables[0]?.bw) {
    throw new Error(
      "bảng words/book_words chưa tồn tại — áp dụng migration 0002 (drizzle) trước khi chạy suite vocabulary",
    );
  }
  const books: { id: number }[] = await c`
    select id from books where slug = ${VOCAB_BOOK_SLUG}
  `;
  const book = books[0];
  if (!book) throw new Error(`book ${VOCAB_BOOK_SLUG} không tồn tại — DB template sai`);
  await c.begin(async (tx) => {
    for (const w of FIXTURE_WORDS) {
      const inserted: { id: number }[] = await tx`
        insert into words (word, ipa, meaning_vi, example, audio_url)
        values (${w.word}, ${w.ipa}, ${w.meaning}, ${w.example}, ${w.audio})
        on conflict (word) do update set audio_url = excluded.audio_url
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

/** Self-clean cuối run — xoá words (cascade book_words + user_word_progress).
 * Bảng chưa migrate → bỏ qua (lỗi thật đã fail ở setup/assert, đừng nuốt). */
export async function cleanupVocabularyFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  const names = FIXTURE_WORDS.map((w) => w.word);
  await c`delete from words where word = any(${names})`;
}

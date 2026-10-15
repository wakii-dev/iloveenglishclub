/**
 * Cleanup fixture Vocab CMS (VU-43 SF-1 task 14 — dùng chung SF-2/SF-3/SF-4).
 * Xoá words theo prefix fixture `qa-cms-%` + crawl_entries slug `qa-cms-%`
 * (pattern seed spec §8) — FK CASCADE dọn theo: words → book_words /
 * user_word_progress / vocab_activity (verified confdeltype='c').
 * crawl_entries KHÔNG có FK con (lake read-only) — xoá trực tiếp.
 *
 * DRY-RUN MẶC ĐỊNH: chỉ LIỆT KÊ sẽ xoá gì. Thực xoá: cờ `--apply`.
 * KHÔNG đụng words/crawl_entries thật (prefix fixture quy ước tránh UNIQUE
 * thật trên shared-DB — pattern scripts/cleanup-test-data.ts).
 *
 * Chạy: node e2e/helpers/cleanup-vocab-cms.ts [--apply] [DATABASE_URL từ .env.local]
 */
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const WORD_PATTERN = "qa-cms-%";
const ENTRY_PATTERN = "qa-cms-%";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL thiếu — set trong .env.local");
  process.exit(2);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const [wordsCount, bookWordsCount, progressCount, activityCount, entriesCount] =
  await Promise.all([
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM words WHERE word LIKE ${WORD_PATTERN}`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM book_words WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM user_word_progress WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM vocab_activity WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM crawl_entries WHERE slug LIKE ${ENTRY_PATTERN}`,
  ]);

const n = (rows: ReadonlyArray<{ n: string | number }>): number =>
  Number((rows as { n: string | number }[])[0]?.n ?? 0);

console.log(`Target DB: ${process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")}`);
console.log(`Pattern:   words.word LIKE '${WORD_PATTERN}' · crawl_entries.slug LIKE '${ENTRY_PATTERN}'`);
console.log(`  (FK cascade: words → book_words/user_word_progress/vocab_activity)`);
console.log(
  `Sẽ xoá: words=${n(wordsCount)} · book_words=${n(bookWordsCount)} · user_word_progress=${n(progressCount)} · vocab_activity=${n(activityCount)} · crawl_entries=${n(entriesCount)}`,
);
console.log(`Mode:    ${APPLY ? "THỰC CHẠY (--apply)" : "DRY-RUN (không xoá — thêm --apply để thực)"}`);

if (!APPLY) {
  const sample = await sql`
    SELECT word FROM words WHERE word LIKE ${WORD_PATTERN} ORDER BY word LIMIT 30`;
  for (const r of sample) console.log(`  word: ${r.word}`);
  const entrySample = await sql`
    SELECT slug FROM crawl_entries WHERE slug LIKE ${ENTRY_PATTERN} ORDER BY slug LIMIT 30`;
  for (const r of entrySample) console.log(`  entry: ${r.slug}`);
  await sql.end();
  process.exit(0);
}

if (n(wordsCount) + n(entriesCount) === 0) {
  console.log("Không có gì để xoá.");
  await sql.end();
  process.exit(0);
}

// words là gốc cascade (book_words/user_word_progress/vocab_activity đều
// CASCADE theo word_id); crawl_entries không có FK — xoá song song an toàn
await sql`DELETE FROM words WHERE word LIKE ${WORD_PATTERN}`;
await sql`DELETE FROM crawl_entries WHERE slug LIKE ${ENTRY_PATTERN}`;

const [leftWords, leftBookWords, leftProgress, leftActivity, leftEntries] =
  await Promise.all([
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM words WHERE word LIKE ${WORD_PATTERN}`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM book_words WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM user_word_progress WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM vocab_activity WHERE word_id IN (SELECT id FROM words WHERE word LIKE ${WORD_PATTERN})`,
    sql<{ n: string | number }[]>`SELECT count(*) AS n FROM crawl_entries WHERE slug LIKE ${ENTRY_PATTERN}`,
  ]);

console.log(
  `Đã xoá. Còn lại pattern: words=${n(leftWords)} · entries=${n(leftEntries)}`,
);
const orphanTotal =
  n(leftBookWords) + n(leftProgress) + n(leftActivity);
console.log(
  `Orphan check (phải 0 hết): book_words=${n(leftBookWords)} · progress=${n(leftProgress)} · vocab_activity=${n(leftActivity)}`,
);
if (n(leftWords) + n(leftEntries) + orphanTotal > 0) {
  console.error("FAIL: còn sót/orphan — kiểm tra FK cascade.");
  await sql.end();
  process.exit(1);
}
await sql.end();

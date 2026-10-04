import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB SF-3 crawl UI (VU-35) — context pack §7: bootstrap ASSERT
 * migration 0004 đã chạy (DB template VU-24 ilec_sf2..sf5 KHÔNG có
 * crawl_entries — không tái dùng mù); seed dữ liệu QA unique-per-run +
 * self-clean trên DB dev dùng chung (Neon).
 *
 * - Book QA `qa-sf3-<run>` id 910000+ — KHÔNG đụng 7 books seed cố định.
 * - Words prefix `qasf3-` (201 cho loop batch >200 + 3 từ enrich hợp đồng).
 * - Crawl entries prefix `qasf3-` — INSERT mirror seedCrawlEntry (SF-2,
 *   src/lib/oxford/enrich.ts) y semantic: ON CONFLICT (slug) DO UPDATE,
 *   raw jsonb {headword, senses:[{def,examples}]} để derive example sense 1.
 *   Import seedCrawlEntry trực tiếp KHÔNG chạy được ở đây: enrich.ts import
 *   `@/db` (alias không resolve ngoài Next/vitest) — fixture chạy TRƯỚC khi
 *   `next dev` bind (pattern vocabulary config) nên dùng raw SQL thay thế,
 *   same columns/same upsert.
 * - Teardown sweep theo PREFIX — re-run tự dọn leftover run crash trước đó.
 */
dotenv.config({ path: ".env.local" });

export const WORD_PREFIX = "qasf3-";
export const BOOK_SLUG_PREFIX = "qa-sf3-";
export const BOOK_ID_BASE = 910000;

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export type FixtureInfo = {
  bookId: number;
  bookSlug: string;
  wordIds: { tree: number; book: number; nomatch: number };
};

/** Migration 0004 (crawl_entries) phải có — fail RÕ thay vì lỗi mù phía sau. */
async function assertMigration0004(c: postgres.Sql): Promise<void> {
  const [row] = await c`select to_regclass('crawl_entries') as t`;
  if (!row || row.t === null) {
    throw new Error(
      "crawl_entries KHÔNG tồn tại — migration 0004 chưa chạy trên DB này (npx drizzle-kit migrate) — dừng trước khi seed mù",
    );
  }
}

/** Sweep mọi fixture QA cũ (run crash/cũ) theo prefix — re-run an toàn. */
export async function cleanupOxfordCrawlFixture(): Promise<void> {
  const c = client();
  await c`delete from words where word like ${WORD_PREFIX + "%"}`;
  await c`delete from books where slug like ${BOOK_SLUG_PREFIX + "%"}`;
  await c`delete from crawl_entries where slug like ${WORD_PREFIX + "%"}`;
}

async function seedCrawlEntryMirror(
  c: postgres.Sql,
  row: {
    slug: string;
    word?: string | null;
    ipaUk?: string | null;
    ipaUs?: string | null;
    cefr?: string | null;
    pos?: string | null;
    audioUkBlob?: string | null;
    audioUsBlob?: string | null;
    example?: string | null;
    status?: "pending" | "parsed" | "failed";
    attempts?: number;
    lastError?: string | null;
  },
): Promise<void> {
  const status = row.status ?? "parsed";
  const raw =
    row.example != null || status === "parsed"
      ? {
          headword: row.word ?? row.slug,
          senses: [{ def: null, examples: row.example != null ? [row.example] : [] }],
          idioms: [],
          phrasalVerbs: [],
        }
      : null;
  await c`
    insert into crawl_entries (slug, word, ipa_uk, ipa_us, cefr, pos,
                               audio_uk_blob, audio_us_blob, raw, status,
                               attempts, last_error)
    values (${row.slug}, ${row.word ?? null}, ${row.ipaUk ?? null}, ${row.ipaUs ?? null},
            ${row.cefr ?? null}, ${row.pos ?? null}, ${row.audioUkBlob ?? null},
            ${row.audioUsBlob ?? null}, ${raw === null ? null : JSON.stringify(raw)}::jsonb,
            ${status}, ${row.attempts ?? 0}, ${row.lastError ?? null})
    on conflict (slug) do update set
      word = excluded.word, ipa_uk = excluded.ipa_uk, ipa_us = excluded.ipa_us,
      cefr = excluded.cefr, pos = excluded.pos,
      audio_uk_blob = excluded.audio_uk_blob, audio_us_blob = excluded.audio_us_blob,
      raw = excluded.raw, status = excluded.status,
      attempts = excluded.attempts, last_error = excluded.last_error`;
}

type SeedWordSpec = {
  word: string;
  meaning: string;
  ipa: string | null;
};

/** Batch insert words + link book_words (1 query mỗi bảng — 201 rows ×
 * round-trip Neon riêng lẻ = >100s, batch = <2s). */
async function seedWordsBatch(
  c: postgres.Sql,
  bookId: number,
  specs: SeedWordSpec[],
): Promise<Map<string, number>> {
  // postgres.js EscapableArray là class nominal — multi-row VALUES qua helper
  // cần cast kiểu (runtime postgres.js chấp nhận mảng thuần)
  const wordRows = specs.map((s) => [s.word, s.ipa, s.meaning]) as unknown as postgres.EscapableArray[];
  const rows = await c<{ id: number; word: string }[]>`
    insert into words (word, ipa, meaning_vi)
    values ${c(wordRows)}
    on conflict (word) do update set meaning_vi = excluded.meaning_vi
    returning id, word`;
  const idByWord = new Map(rows.map((r) => [r.word, r.id]));
  const links = specs
    .map((s, i) => [bookId, idByWord.get(s.word), i + 1])
    .filter((l): l is [number, number, number] => l[1] !== undefined) as unknown as postgres.EscapableArray[];
  await c`
    insert into book_words (book_id, word_id, "order")
    values ${c(links)}
    on conflict do nothing`;
  return idByWord;
}

export async function ensureOxfordCrawlFixture(): Promise<FixtureInfo> {
  const c = client();
  await assertMigration0004(c);
  await cleanupOxfordCrawlFixture();

  const run = Date.now().toString(36);
  const bookSlug = `${BOOK_SLUG_PREFIX}${run}`;
  const bookId = BOOK_ID_BASE + (Date.now() % 90000);
  await c`
    insert into books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    values (${bookId}, ${bookSlug}, 'QA SF3 crawl', 'QA SF3 crawl', 'A1', '#000000', 900)
    on conflict (id) do update set slug = excluded.slug`;

  // Crawl entries — kịch bản assert:
  // - tree: entry đủ (IPA/example/cefr/blob) → enrich fill 4 field
  // - book: entry KHÔNG example + KHÔNG blob → fill cefr + reason noAudioBlob
  // - failed: sample dashboard + retry-failed (attempts < cap 5)
  // - pending: đóng góp count pending
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}tree`,
    word: "qasf3-tree",
    ipaUk: "/triː/",
    cefr: "A1",
    pos: "noun",
    audioUkBlob: "https://blob.vercel-storage.com/audio/oxford/qasf3-tree.uk-fake.mp3",
    example: "I climbed a qasf3-tree.",
  });
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}book`,
    word: "qasf3-book",
    ipaUk: "/bʊk/",
    cefr: "A2",
    pos: "noun",
  });
  // crawl-on-add cache-hit approve: entry CÓ blob nhưng KHÔNG nằm trong book
  // (không là word) → approve tạo word MỚI 201 + audioAttached. Không đụng
  // enrich counts (không phải book word — match chỉ quét words của book).
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}cache-add`,
    word: "qasf3-cache-add",
    ipaUk: "/kæʃ/",
    cefr: "B1",
    pos: "noun",
    audioUkBlob: "https://blob.vercel-storage.com/audio/oxford/qasf3-cache-add.uk-fake.mp3",
    example: "Warm the qasf3-cache-add.",
  });
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}crash-me`,
    status: "failed",
    attempts: 1,
    lastError: "HTTP 500 — QA mock failure",
  });
  await seedCrawlEntryMirror(c, { slug: `${WORD_PREFIX}wait-me`, status: "pending" });

  // 201 words → loop batch: 2 chunks (200 + 1) — context pack §3
  // - tree: TRỐNG hoàn toàn → fill-empty đầy đủ
  // - book: IPA teacher PRESET → contract fill-empty: KHÔNG bị đụng
  // - nomatch + 198 filler: không khớp crawl → reason noMatch
  const specs: SeedWordSpec[] = [
    { word: `${WORD_PREFIX}tree`, meaning: "QA cây", ipa: null },
    { word: `${WORD_PREFIX}book`, meaning: "QA sách", ipa: "/bʊk-preset/" },
    { word: `${WORD_PREFIX}nomatch`, meaning: "QA không khớp", ipa: null },
  ];
  for (let i = 1; i <= 198; i++) {
    specs.push({
      word: `${WORD_PREFIX}fill-${String(i).padStart(3, "0")}`,
      meaning: "QA filler",
      ipa: null,
    });
  }
  const idByWord = await seedWordsBatch(c, bookId, specs);

  return {
    bookId,
    bookSlug,
    wordIds: {
      tree: idByWord.get(`${WORD_PREFIX}tree`)!,
      book: idByWord.get(`${WORD_PREFIX}book`)!,
      nomatch: idByWord.get(`${WORD_PREFIX}nomatch`)!,
    },
  };
}

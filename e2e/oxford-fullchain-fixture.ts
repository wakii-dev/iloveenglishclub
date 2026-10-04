import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB SF-4 fullchain (VU-36) — context pack §spec slice 2: full-chain
 * crawl(mock) → enrich → public vocabulary + flashcards + lookup. Bootstrap
 * ASSERT migration 0004 (crawl_entries) — fail rõ thay vì lỗi mù phía sau
 * (pattern oxford-crawl-fixture SF-3).
 *
 * - Book QA `qa-sf4-<run>` slug unique-per-run → unstable_cache
 *   `vocabulary:<slug>` luôn lạnh lần render đầu (không lệ thuộc revalidate).
 * - Words prefix `qasf4`:
 *   - `qasf4oak`  — ĐÃ enriched (source='oxford-ld' + ipa/example/audio_url
 *     trỏ file STATIC `audio/qa-sf4/sample.mp3` — phát được thật trong e2e,
 *     không phụ thuộc Blob mạng).
 *   - `qasf4fern` — teacher-only (chỉ meaning) → KHÔNG attribution (ACCEPTANCE 1).
 *   - `qasf4elm`  — trống (chỉ meaning) + crawl entry `qasf4elm` parsed →
 *     enrich fill-empty (T2): example/ipa/cefr/audio + source → attribution
 *     xuất hiện SAU enrich = bằng chứng full-chain thật.
 * - audio_url RELATIVE 'audio/qa-sf4/sample.mp3' → resolveStoredAudioUrl ra
 *   `/audio/qa-sf4/sample.mp3` (static public/) — cùng pipeline pass-through
 *   như blob URL thật (enrich copy audio_uk_blob nguyên vẹn).
 * - Teardown sweep theo PREFIX — re-run tự dọn leftover run crash.
 */
dotenv.config({ path: ".env.local" });

export const WORD_PREFIX = "qasf4";
export const BOOK_SLUG_PREFIX = "qa-sf4-";
export const AUDIO_REL_PATH = "audio/qa-sf4/sample.mp3";

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export type FixtureInfo = {
  bookId: number;
  bookSlug: string;
};

/** Migration 0004 (crawl_entries) phải có — pattern SF-3. */
async function assertMigration0004(c: postgres.Sql): Promise<void> {
  const [row] = await c`select to_regclass('crawl_entries') as t`;
  if (!row || row.t === null) {
    throw new Error(
      "crawl_entries KHÔNG tồn tại — migration 0004 chưa chạy trên DB này (npx drizzle-kit migrate) — dừng trước khi seed mù",
    );
  }
}

/** Sweep mọi fixture QA cũ (run crash/cũ) theo prefix — re-run an toàn. */
export async function cleanupOxfordFullchainFixture(): Promise<void> {
  const c = client();
  await c`delete from words where word like ${WORD_PREFIX + "%"}`;
  await c`delete from books where slug like ${BOOK_SLUG_PREFIX + "%"}`;
  await c`delete from crawl_entries where slug like ${WORD_PREFIX + "%"}`;
}

/** Đóng client fixture (teardown) — postgres.js socket kill-race khi process
 * exit giữa 2 write gây global error "write CONNECTION_ENDED" (Neon pooler)
 * làm run exit 1 dù tests xanh. end({timeout}) + reset singleton. */
export async function endOxfordFullchainClient(): Promise<void> {
  await sql?.end({ timeout: 5 }).catch(() => {});
  sql = null;
}

/** Mirror seedCrawlEntry (SF-2) — c.json(raw) chống double-encode (SF-3 lesson). */
async function seedCrawlEntryMirror(
  c: postgres.Sql,
  row: {
    slug: string;
    word?: string | null;
    ipaUk?: string | null;
    cefr?: string | null;
    pos?: string | null;
    audioUkBlob?: string | null;
    example?: string | null;
    status?: "pending" | "parsed" | "failed";
  },
): Promise<void> {
  const status = row.status ?? "parsed";
  const raw = {
    headword: row.word ?? row.slug,
    senses: [{ def: null, examples: row.example != null ? [row.example] : [] }],
    idioms: [],
    phrasalVerbs: [],
  };
  await c`
    insert into crawl_entries (slug, word, ipa_uk, ipa_us, cefr, pos,
                               audio_uk_blob, audio_us_blob, raw, status,
                               attempts, last_error)
    values (${row.slug}, ${row.word ?? null}, ${row.ipaUk ?? null}, null,
            ${row.cefr ?? null}, ${row.pos ?? null}, ${row.audioUkBlob ?? null},
            null, ${c.json(raw)}, ${status}, 0, null)
    on conflict (slug) do update set
      word = excluded.word, ipa_uk = excluded.ipa_uk, ipa_us = excluded.ipa_us,
      cefr = excluded.cefr, pos = excluded.pos,
      audio_uk_blob = excluded.audio_uk_blob, audio_us_blob = excluded.audio_us_blob,
      raw = excluded.raw, status = excluded.status,
      attempts = excluded.attempts, last_error = excluded.last_error`;
}

type SeedWordFull = {
  word: string;
  meaning: string;
  ipa: string | null;
  example: string | null;
  audioUrl: string | null;
  cefr: string | null;
  source: string | null;
};

async function seedWordFull(
  c: postgres.Sql,
  bookId: number,
  order: number,
  w: SeedWordFull,
): Promise<number> {
  const [row] = await c<{ id: number }[]>`
    insert into words (word, ipa, meaning_vi, example, audio_url, cefr, source)
    values (${w.word}, ${w.ipa}, ${w.meaning}, ${w.example}, ${w.audioUrl},
            ${w.cefr}, ${w.source})
    on conflict (word) do update set meaning_vi = excluded.meaning_vi
    returning id`;
  await c`
    insert into book_words (book_id, word_id, "order")
    values (${bookId}, ${row.id}, ${order})
    on conflict do nothing`;
  return row.id;
}

export async function ensureOxfordFullchainFixture(): Promise<FixtureInfo> {
  const c = client();
  await assertMigration0004(c);
  await cleanupOxfordFullchainFixture();

  const run = Date.now().toString(36);
  const bookSlug = `${BOOK_SLUG_PREFIX}${run}`;
  // dải id RỜI fixture SF-3 (910000..999999 — oxford-crawl-fixture.ts): base
  // 1_000_000 + %30000 → 1000000..1029999, không giao nhau (2 lane song song
  // 2 worktree trên DB chung không đè slug nhau qua on-conflict-id)
  const bookId = 1000000 + (Date.now() % 30000);
  await c`
    insert into books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
    values (${bookId}, ${bookSlug}, 'QA SF4 fullchain', 'QA SF4 fullchain', 'A1', '#000000', 950)
    on conflict (id) do update set slug = excluded.slug`;

  await seedWordFull(c, bookId, 1, {
    word: `${WORD_PREFIX}oak`,
    meaning: "cây sồi (QA sf4)",
    ipa: "oʊk",
    example: "The qasf4oak is tall.",
    audioUrl: AUDIO_REL_PATH,
    cefr: "A1",
    source: "oxford-ld",
  });
  await seedWordFull(c, bookId, 2, {
    word: `${WORD_PREFIX}fern`,
    meaning: "dương xỉ (QA sf4)",
    ipa: null,
    example: null,
    audioUrl: null,
    cefr: null,
    source: null,
  });
  await seedWordFull(c, bookId, 3, {
    word: `${WORD_PREFIX}elm`,
    meaning: "cây du (QA sf4)",
    ipa: null,
    example: null,
    audioUrl: null,
    cefr: null,
    source: null,
  });

  // crawl entry cho crawl-on-add cache-hit (T2 test 3) — KHÔNG example:
  // approve tạo word (ipa/cefr/audio từ entry) nhưng example vẫn null →
  // enrich dryRun counts deterministic (maple chỉ vào `candidates`, không
  // vào fillableExample — chỉ elm là fillable cả 4 field)
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}maple`,
    word: `${WORD_PREFIX}maple`,
    ipaUk: "meɪpəl",
    cefr: "B1",
    pos: "noun",
    audioUkBlob: AUDIO_REL_PATH,
    example: null,
  });

  // crawl entry cho qasf4elm — enrich fill-empty (T2): example/ipa/cefr/audio
  await seedCrawlEntryMirror(c, {
    slug: `${WORD_PREFIX}elm`,
    word: `${WORD_PREFIX}elm`,
    ipaUk: "elm",
    cefr: "B1",
    pos: "noun",
    audioUkBlob: AUDIO_REL_PATH,
    example: "The qasf4elm grows fast.",
  });

  // KHÔNG c.end() ở đây — globalSetup + globalTeardown chạy CÙNG process
  // (Playwright main): singleton `sql` phải sống tới teardown end() (client
  // ended-mà-singleton-giữ = teardown write lên socket chết → global error
  // CONNECTION_ENDED, run exit 1 dù tests xanh). Seed qua `node -e` (webServer
  // command) thoát bằng process.exit(0) — socket chết cùng process, sạch.
  return { bookId, bookSlug };
}

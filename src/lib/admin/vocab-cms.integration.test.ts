import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Vocab CMS stores trên DB THẬT (VU-43 SF-1 — env-gated, pattern
 * vocab-leaderboard-view.integration.test.ts).
 * Chạy: ILEC_TEMPLATE_DB_URL=postgres://…ilec_vu43_sf1 node node_modules/vitest/vitest.mjs run src/lib/admin/vocab-cms.integration.test.ts
 * Không set env → skip (CI không DB — unit tests phủ logic thuần).
 * Pin semantics mock-db không đo được: ILIKE escape trên Neon, orphan join,
 * sort cefr null-last, duplicate predicate, histogram 'b2 ' → other + TỔNG
 * buckets = tổng words, advisory-lock 2 bulk assign SONG SONG không 23505.
 * Fixture prefix `qa-cms-int-` — chỉ đụng template DB, KHÔNG production.
 */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => {},
}));
const revalidateContent = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  CONTENT_TAG: "content",
  revalidateContent,
}));

const TEMPLATE_URL = process.env.ILEC_TEMPLATE_DB_URL;
const describeDb = TEMPLATE_URL ? describe : describe.skip;

const FIXTURE_WORDS = [
  "qa-cms-int-alpha",
  "qa-cms-int-beta",
  "qa-cms-int-gamma",
  "qa-cms-int-delta",
];
const BOOK_ID = 9871;

const sql = TEMPLATE_URL ? postgres(TEMPLATE_URL, { max: 3, prepare: false }) : null;

// @/db đọc DATABASE_URL lúc import — trỏ template TRƯỚC khi import stores
if (TEMPLATE_URL) process.env.DATABASE_URL = TEMPLATE_URL;

const { listVocabulary } = await import("./vocabulary-store");
const { listCrawlEntries } = await import("./crawl-entries-store");
const { cmsStatsDb } = await import("./cms-stats-store");
const { bulkAssignBooks } = await import("./cms-bulk-store");

describeDb("vocab-cms stores (integration — template DB)", () => {
  let wordIds: number[] = [];

  beforeAll(async () => {
    if (!sql) return;
    await sql`
      INSERT INTO books (id, slug, title_en, cefr_label, color, sort_order)
      VALUES (${BOOK_ID}, 'qa-cms-int-book', 'QA CMS Integration', 'A1', '#000000', 9871)
      ON CONFLICT (id) DO NOTHING`;
    for (const w of FIXTURE_WORDS) {
      await sql`
        INSERT INTO words (word, meaning_vi, cefr, audio_url)
        VALUES (${w}, ${"nghĩa qa " + w.slice(-5)},
          ${w.endsWith("alpha") ? "b1 " : w.endsWith("beta") ? "B2" : null},
          ${w.endsWith("gamma") ? "https://cdn.example.com/a.mp3" : null})
        ON CONFLICT (word) DO NOTHING`;
    }
    const rows = await sql<{ id: number; word: string }[]>`
      SELECT id, word FROM words WHERE word LIKE 'qa-cms-int-%' ORDER BY id`;
    wordIds = rows.map((r) => r.id);
    const delta = rows.find((r) => r.word.endsWith("delta"));
    if (delta) {
      await sql`
        INSERT INTO book_words (book_id, word_id, "order")
        VALUES (${BOOK_ID}, ${delta.id}, 1)
        ON CONFLICT DO NOTHING`;
    }
    // entry fixture: word case+space khác — duplicate predicate phải khớp alpha
    await sql`
      INSERT INTO crawl_entries (slug, word, status, cefr, pos, ox3000)
      VALUES (${"qa-cms-int-entry"}, ${"QA-CMS-INT-ALPHA "}, 'parsed', 'A1', 'noun', true)
      ON CONFLICT (slug) DO NOTHING`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM book_words WHERE book_id = ${BOOK_ID}`;
    await sql`DELETE FROM words WHERE word LIKE 'qa-cms-int-%'`;
    await sql`DELETE FROM books WHERE slug = 'qa-cms-int-book'`;
    await sql`DELETE FROM crawl_entries WHERE slug LIKE 'qa-cms-int-%'`;
    await sql.end();
    const client = (
      (await import("@/db")) as { db: { $client: postgres.Sql } }
    ).db.$client;
    await client.end({ timeout: 5 });
  });

  it("listVocabulary: q match nghĩa có dấu; q literal % không quét; cefr 'b1 ' match B1; orphan WIN; sort cefr null CUỐI", { timeout: 90_000 }, async () => {
    const byMeaning = await listVocabulary({ q: "nghĩa qa", limit: 50, offset: 0 });
    expect(byMeaning.items.length).toBeGreaterThanOrEqual(2);

    // q literal '%' escape — không trả fixture nào (nếu escape vỡ, ILIKE %%
    // match tất cả → test bắt)
    const literal = await listVocabulary({ q: "nghĩa qa %", limit: 50, offset: 0 });
    expect(literal.items.filter((i) => i.word.startsWith("qa-cms-int"))).toEqual([]);

    const b1 = await listVocabulary({ cefr: ["B1"], limit: 50, offset: 0 });
    expect(b1.items.some((i) => i.word === "qa-cms-int-alpha")).toBe(true);

    // orphan WIN khi conflict bookId: alpha/beta/gamma orphan; delta đã gắn
    const orphans = await listVocabulary({
      bookId: BOOK_ID,
      orphan: true,
      limit: 50,
      offset: 0,
    });
    const orphanWords = orphans.items.map((i) => i.word);
    expect(orphanWords).toContain("qa-cms-int-alpha");
    expect(orphanWords).not.toContain("qa-cms-int-delta");

    // bookId (không orphan) → INNER JOIN cũ: delta
    const inBook = await listVocabulary({ bookId: BOOK_ID, limit: 50, offset: 0 });
    expect(inBook.items.map((i) => i.word)).toContain("qa-cms-int-delta");

    // sort cefr: null CUỐI (PG ASC NULLS LAST mặc định)
    const sorted = await listVocabulary({ sort: "cefr", limit: 50, offset: 0 });
    const fixtureSorted = sorted.items.filter((i) => i.word.startsWith("qa-cms-int"));
    const nonNull = fixtureSorted.filter((i) => i.cefr !== null);
    const nulls = fixtureSorted.filter((i) => i.cefr === null);
    expect(nonNull.length).toBeGreaterThan(0);
    expect(nulls.length).toBeGreaterThan(0);
    expect(fixtureSorted.slice(-nulls.length).every((i) => i.cefr === null)).toBe(true);
  });

  it("listCrawlEntries: hasWord duplicate predicate (lower+trim) đúng trên DB", { timeout: 90_000 }, async () => {
    // q match DISPLAY string = COALESCE(word, pretty slug) — pretty slug có
    // SPACE (dash→space), không phải dấu gạch
    const page = await listCrawlEntries({ q: "qa cms int entry", limit: 50, offset: 0 });
    expect(page.total).toBeGreaterThanOrEqual(1);
    const entry = page.items.find((i) => i.slug === "qa-cms-int-entry");
    expect(entry).toBeDefined();
    // entry.word 'QA-CMS-INT-ALPHA ' (case+space khác) — words có 'qa-cms-int-alpha'
    expect(entry!.hasWord).toBe(true);
  });

  it("cmsStatsDb: histogram 'b2 ' → other + TỔNG buckets = tổng words (khớp SQL đếm trực tiếp)", { timeout: 90_000 }, async () => {
    if (!sql) return;
    await sql`
      INSERT INTO words (word, meaning_vi, cefr)
      VALUES ('qa-cms-int-dirty', 'nghĩa bẩn', 'b2 ')
      ON CONFLICT (word) DO NOTHING`;
    try {
      const stats = await cmsStatsDb();
      const [direct] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM words`;
      const bucketTotal = Object.values(stats.cefrHistogram).reduce((a, b) => a + b, 0);
      expect(stats.totals.words).toBe(direct.n);
      expect(bucketTotal).toBe(direct.n); // §5.8 tổng = tổng words kể cả 'b2 '
      expect(stats.cefrHistogram.other).toBeGreaterThanOrEqual(1);
      expect(stats.perBook.length).toBeGreaterThanOrEqual(1);
      expect(stats.crawl.counts.parsed).toBeGreaterThanOrEqual(0);
    } finally {
      await sql`DELETE FROM words WHERE word = 'qa-cms-int-dirty'`;
    }
  });

  it("bulkAssignBooks 2 request SONG SONG cùng book → KHÔNG 23505, order nối tiếp unique, re-run → skipped", { timeout: 90_000 }, async () => {
    if (!sql) return;
    const [r1, r2] = await Promise.all([
      bulkAssignBooks([wordIds[0]!, wordIds[1]!], [BOOK_ID]),
      bulkAssignBooks([wordIds[2]!, wordIds[3]!], [BOOK_ID]),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.report.errors).toEqual([]);
    expect(r2.report.errors).toEqual([]);
    const orders = await sql<{ order: number }[]>`
      SELECT "order" FROM book_words WHERE book_id = ${BOOK_ID} ORDER BY "order"`;
    const seq = orders.map((o) => o.order);
    expect(new Set(seq).size).toBe(seq.length); // unique book,order không vỡ
    const again = await bulkAssignBooks([wordIds[0]!], [BOOK_ID]);
    if (again.ok) {
      expect(again.report.skipped).toBe(1); // idempotent onConflictDoNothing
      expect(again.report.affected).toBe(0);
    } else {
      expect.unreachable("re-run phải ok");
    }
  });
});

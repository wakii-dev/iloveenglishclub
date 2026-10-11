import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Contract test §6.5 (VU-43 SF-4 t7 — test-ownership map §8: SF-4 sở hữu
 * "contract test SQL-khớp"; route SHAPE đã pin ở stats/route.test.ts SF-1,
 * đây là leg DỮ LIỆU: TỪNG số của cmsStatsDb phải khớp SQL count(*) viết
 * tay trên CÙNG DB — seed/mutable fixture, histogram kể cả row bẩn 'b2 ').
 *
 * Chạy: ILEC_TEMPLATE_DB_URL=postgres://… node node_modules/vitest/vitest.mjs
 * run src/lib/admin/cms-stats-contract.integration.test.ts
 * Không set env → skip (unit legs + shape test phủ logic thuần).
 * Fixture prefix `qa-cms-con-` — chỉ đụng template/shared QA DB, tự dọn.
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

const BOOK_ID = 9873;

const sql = TEMPLATE_URL ? postgres(TEMPLATE_URL, { max: 3, prepare: false }) : null;

// @/db đọc DATABASE_URL lúc import — trỏ template TRƯỚC khi import store
if (TEMPLATE_URL) process.env.DATABASE_URL = TEMPLATE_URL;

const { cmsStatsDb } = await import("./cms-stats-store");

describeDb("cmsStatsDb contract — từng số khớp SQL trực tiếp (§6.5)", () => {
  beforeAll(async () => {
    if (!sql) return;
    await sql`
      INSERT INTO books (id, slug, title_en, cefr_label, color, sort_order)
      VALUES (${BOOK_ID}, 'qa-cms-con-book', 'QA CMS Stats Contract', 'A1', '#000000', 9873)
      ON CONFLICT (id) DO NOTHING`;
    // Fixture phân bố CỐ ĐỊNH: A1(+audio+image) A2 B2(+audio) 'b2 '(bẩn)
    // NULL(+image) — 2 từ gắn book (1 có audio), 3 orphan
    const rows: [string, string | null, string | null, string | null][] = [
      ["qa-cms-con-a1", "A1", "https://qa.test/a.mp3", "https://qa.test/a.png"],
      ["qa-cms-con-a2", "A2", null, null],
      ["qa-cms-con-b2", "B2", "https://qa.test/b.mp3", null],
      ["qa-cms-con-dirty", "b2 ", null, null], // bẩn → bucket other
      ["qa-cms-con-null", null, null, "https://qa.test/n.png"],
    ];
    for (const [word, cefr, audio, image] of rows) {
      await sql`
        INSERT INTO words (word, meaning_vi, cefr, audio_url, image_url, source)
        VALUES (${word}, ${"nghĩa contract " + word.slice(-4)}, ${cefr}, ${audio}, ${image},
          ${word.endsWith("a1") || word.endsWith("b2") ? "oxford-ld" : null})
        ON CONFLICT (word) DO UPDATE SET
          cefr = EXCLUDED.cefr, audio_url = EXCLUDED.audio_url,
          image_url = EXCLUDED.image_url, source = EXCLUDED.source`;
    }
    // 2 từ đầu gắn book — 3 từ còn lại orphan; a1 gắn + CÓ audio
    const linked = await sql<{ id: number }[]>`
      SELECT id FROM words WHERE word IN ('qa-cms-con-a1', 'qa-cms-con-a2') ORDER BY id`;
    let order = 1;
    for (const row of linked) {
      await sql`
        INSERT INTO book_words (book_id, word_id, "order")
        VALUES (${BOOK_ID}, ${row.id}, ${order++})
        ON CONFLICT (book_id, word_id) DO NOTHING`;
    }
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM book_words WHERE book_id = ${BOOK_ID}`;
    await sql`DELETE FROM words WHERE word LIKE 'qa-cms-con-%'`;
    await sql`DELETE FROM books WHERE slug = 'qa-cms-con-book'`;
    await sql.end();
    const client = (
      (await import("@/db")) as { db: { $client: postgres.Sql } }
    ).db.$client;
    await client.end({ timeout: 5 });
  });

  it(
    "totals + cefrHistogram + perSource + perBook: store === SQL count(*) cùng DB (kể cả 'b2 ' → other)",
    { timeout: 120_000 },
    async () => {
      if (!sql) return;
      const stats = await cmsStatsDb();

      // --- totals: 5 số vs SQL viết tay trên CÙNG DB ---
      const [direct] = await sql<{
        words: number;
        withAudio: number;
        withImage: number;
        enriched: number;
        orphan: number;
      }[]>`
        SELECT count(*)::int AS words,
               count(*) FILTER (WHERE audio_url IS NOT NULL)::int AS "withAudio",
               count(*) FILTER (WHERE image_url IS NOT NULL)::int AS "withImage",
               count(*) FILTER (WHERE source = 'oxford-ld')::int AS enriched,
               (SELECT count(*)::int FROM words w
                 WHERE NOT EXISTS (SELECT 1 FROM book_words bw WHERE bw.word_id = w.id)) AS orphan
        FROM words`;
      expect(stats.totals).toEqual({
        words: direct!.words,
        withAudio: direct!.withAudio,
        withImage: direct!.withImage,
        enriched: direct!.enriched,
        orphan: direct!.orphan,
      });

      // --- histogram: từng bucket vs SQL group CASE (raw, KHÔNG normalize —
      // rule đo data thật: 'b2 ' → other, NULL → untagged) ---
      const buckets = await sql<{ bucket: string; n: number }[]>`
        SELECT CASE
                 WHEN cefr IN ('A1','A2','B1','B2','C1','C2') THEN cefr
                 WHEN cefr IS NULL THEN 'untagged'
                 ELSE 'other'
               END AS bucket,
               count(*)::int AS n
        FROM words GROUP BY 1`;
      const byBucket = Object.fromEntries(buckets.map((b) => [b.bucket, b.n]));
      for (const key of ["A1", "A2", "B1", "B2", "C1", "C2", "untagged", "other"] as const) {
        expect(
          stats.cefrHistogram[key],
          `bucket ${key}: store vs SQL`,
        ).toBe(byBucket[key] ?? 0);
      }
      // tổng buckets = tổng words (§5.8) — kể cả fixture 'b2 ' bẩn
      const bucketTotal = Object.values(stats.cefrHistogram).reduce((a, b) => a + b, 0);
      expect(bucketTotal).toBe(direct!.words);
      expect(stats.cefrHistogram.other).toBeGreaterThanOrEqual(1); // 'b2 ' đếm trong other

      // --- perSource: teacher = source NULL, oxford-ld = equality ---
      const sources = await sql<{ source: string | null; n: number }[]>`
        SELECT source, count(*)::int AS n FROM words GROUP BY source`;
      const expectedSource: Record<string, number> = {};
      for (const s of sources) expectedSource[s.source ?? "teacher"] = s.n;
      expect(stats.perSource).toEqual(expectedSource);

      // --- perBook: từng book words/withAudio khớp SQL; fixture book có mặt;
      // tổng words qua mọi book = tổng book_words ---
      const perBookSql = await sql<{ book_id: number; words: number; withAudio: number }[]>`
        SELECT b.id AS book_id,
               count(bw.word_id)::int AS words,
               count(w.id) FILTER (WHERE w.audio_url IS NOT NULL)::int AS "withAudio"
        FROM books b
        LEFT JOIN book_words bw ON bw.book_id = b.id
        LEFT JOIN words w ON w.id = bw.word_id
        GROUP BY b.id`;
      expect(stats.perBook.length).toBe(perBookSql.length);
      const storeByBook = new Map(stats.perBook.map((b) => [b.bookId, b]));
      for (const row of perBookSql) {
        const storeRow = storeByBook.get(row.book_id);
        expect(
          { bookId: row.book_id, store: storeRow?.words, sql: row.words },
          `book ${row.book_id} words`,
        ).toEqual({ bookId: row.book_id, store: row.words, sql: row.words });
        expect(
          { bookId: row.book_id, store: storeRow?.withAudio, sql: row.withAudio },
          `book ${row.book_id} withAudio`,
        ).toEqual({ bookId: row.book_id, store: row.withAudio, sql: row.withAudio });
      }
      const fixtureRow = storeByBook.get(BOOK_ID);
      expect(fixtureRow?.words).toBe(2);
      expect(fixtureRow?.withAudio).toBe(1); // a1 có audio, a2 không
      const storeSum = stats.perBook.reduce((sum, b) => sum + b.words, 0);
      const [bwTotal] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM book_words`;
      expect(storeSum).toBe(bwTotal!.n);
    },
  );
});

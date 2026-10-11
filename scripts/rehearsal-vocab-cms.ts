/**
 * Rehearsal dữ liệu thật Vocab CMS (VU-43 SF-4 t9) — đo thời gian từng op
 * được pin ở context pack: bulk assign 500 · export 5k · backfill scoped 200
 * (dry-run) · promote 20. Chạy trên template/QA Neon (DATABASE_URL từ
 * .env.local — KHÔNG prod), fixture prefix `qa-cms-reh-` (khớp cleanup helper
 * 'qa-cms-%'), tự dọn book + words + entries sau khi đo, verify 0 leftover.
 *
 * Ops bắn QUA HTTP route thật (dev server đang chạy) — đo latency route end-
 * to-end như teacher dùng, không phải store thuần. Session admin = forged JWT
 * (cùng cơ chế e2e/admin-lib.ts forgeSessionToken).
 *
 * Chạy:
 *   node scripts/rehearsal-vocab-cms.ts [--base-url http://localhost:3000] \
 *     [--out docs/superpowers/evidence/sf-4-vocab-cms/rehearsal-timings.json]
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
import dotenv from "dotenv";
import { encode } from "next-auth/jwt";

dotenv.config({ path: ".env.local" });

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const BASE_URL = arg("--base-url", "http://localhost:3000");
const OUT = arg("--out", "");
const WORDS_TOTAL = 5000; // export 5k (mẫu số export, cap route 10k)
const BULK_SIZE = 500; // cap bulk/request — biên đúng cap (§5.1)
const BF_MATCHED = 200; // entry blob khớp backfill plan matched
const PROMOTE_SIZE = 20;

if (!process.env.DATABASE_URL || !process.env.AUTH_SECRET) {
  console.error("DATABASE_URL/AUTH_SECRET thiếu trong .env.local");
  process.exit(2);
}

type Sql = ReturnType<typeof postgres>;
const sql: Sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false });
const PREFIX = "qa-cms-reh";
const W = (n: number) => `${PREFIX}-w${String(n).padStart(5, "0")}`;
const E = (n: number) => `${PREFIX}-e${String(n).padStart(5, "0")}`;
const PR = (n: number) => `${PREFIX}-p${String(n).padStart(5, "0")}`;
const BOOK_SLUG = `${PREFIX}-book`;

async function adminCookie(): Promise<string> {
  // JWT forged cần id CỦA USER THẬT (assertAdmin tra profiles theo
  // session.user.id — id invented → 403 not-admin; cùng cơ chế e2e
  // admin-lib forgeSessionToken dùng userIdOf).
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "admin@ilec.dev";
  const [admin] = await sql<{ id: string }[]>`
    SELECT u.id FROM users u JOIN profiles p ON p.id = u.id
    WHERE u.email = ${adminEmail} AND p.role = 'admin' LIMIT 1`;
  if (!admin) throw new Error(`admin ${adminEmail} không tồn tại — chạy global-setup e2e trước`);
  const token = await encode({
    token: {
      sub: admin.id,
      id: admin.id,
      role: "admin",
      email: adminEmail,
      name: "QA CMS Rehearsal",
      locale: "vi",
    },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
  });
  return `authjs.session-token=${token}`;
}

type OpResult = {
  op: string;
  ms: number;
  status: number;
  detail: Record<string, unknown>;
};

async function timed(
  label: string,
  run: () => Promise<{ status: number; detail: Record<string, unknown> }>,
): Promise<OpResult> {
  const start = performance.now();
  const { status, detail } = await run();
  const ms = Math.round(performance.now() - start);
  console.log(`  ${label}: ${ms}ms (status ${status}) ${JSON.stringify(detail)}`);
  return { op: label, ms, status, detail };
}

async function main(): Promise<void> {
  const cookie = await adminCookie();
  const results: OpResult[] = [];
  let bookId = 0;

  console.log(`Target DB: ${process.env.DATABASE_URL!.replace(/\/\/[^@]*@/, "//***@")}`);
  console.log(`Base URL:  ${BASE_URL}`);
  console.log(`Fixture:   ${PREFIX}-* (cleanup 'qa-cms-%' tương thích helper dùng chung)\n`);

  try {
    // ------------------------------------------------------------------
    // SEED (không tính vào timings — chuẩn bị fixture)
    // ------------------------------------------------------------------
    console.log("Seed fixture…");
    await sql`DELETE FROM books WHERE slug = ${BOOK_SLUG}`; // cascade book_words cũ
    await sql`DELETE FROM words WHERE word LIKE ${PREFIX + "-%"}`;
    await sql`DELETE FROM crawl_entries WHERE slug LIKE ${PREFIX + "-%"}`;
    const [bk] = await sql<{ id: number }[]>`
      INSERT INTO books (id, slug, title_en, title_vi, cefr_label, color, sort_order)
      VALUES ((SELECT coalesce(max(id), 900000) + 1 FROM books WHERE id >= 900000),
              ${BOOK_SLUG}, 'QA CMS Rehearsal', 'QA CMS Rehearsal', 'A1', '#3366cc', 9003)
      RETURNING id`;
    bookId = bk!.id;

    const seedStart = performance.now();
    // 5000 words — CEFR/audio/image biến thiên cho coverage thực
    for (let chunk = 0; chunk < WORDS_TOTAL / 500; chunk++) {
      const rows = Array.from({ length: 500 }, (_, i) => {
        const n = chunk * 500 + i + 1;
        return {
          word: W(n),
          meaning_vi: `nghĩa rehearsal ${n}`,
          cefr: ["A1", "A2", "B1", "B2", "C1", null, "C2", null][i % 8]!,
          audio_url: n % 3 === 0 ? `https://qa-blob.test/reh/${n}.mp3` : null,
          image_url: n % 5 === 0 ? `https://qa-blob.test/reh/${n}.png` : null,
          source: n % 4 === 0 ? "oxford-ld" : null,
        };
      });
      await sql`INSERT INTO words ${sql(rows, "word", "meaning_vi", "cefr", "audio_url", "image_url", "source")}`;
    }
    const wordIds = (
      await sql<{ id: number }[]>`SELECT id FROM words WHERE word LIKE ${PREFIX + "-w%"} ORDER BY id`
    ).map((r) => r.id);
    if (wordIds.length !== WORDS_TOTAL) throw new Error(`seed words ${wordIds.length} ≠ ${WORDS_TOTAL}`);

    // BF_MATCHED entry có blob (backfill plan matched) khớp word 1..200 —
    // slug PHẢI derive được từ word (slugPatterns — pattern match.ts): slug
    // = word (không phải -eN) nếu không candidate fetch không thấy → missing
    for (let chunk = 0; chunk < BF_MATCHED / 100; chunk++) {
      const rows = Array.from({ length: 100 }, (_, i) => {
        const n = chunk * 100 + i + 1;
        return {
          slug: W(n),
          word: W(n),
          cefr: "B1",
          audio_uk_blob: `https://qa-blob.test/audio/oxford/${E(n)}-uk.mp3`,
          status: "parsed",
        };
      });
      await sql`INSERT INTO crawl_entries ${sql(rows, "slug", "word", "cefr", "audio_uk_blob", "status")}`;
    }
    // PROMOTE_SIZE entry promote (word CHƯA tồn tại → created, không duplicate)
    const prRows = Array.from({ length: PROMOTE_SIZE }, (_, i) => ({
      slug: PR(i + 1),
      word: W(WORDS_TOTAL + i + 1),
      cefr: "A2",
      pos: "noun",
      status: "parsed",
    }));
    await sql`INSERT INTO crawl_entries ${sql(prRows, "slug", "word", "cefr", "pos", "status")}`;
    console.log(`  seed xong: ${Math.round(performance.now() - seedStart)}ms (5000 words + 220 entries)\n`);

    const headers = {
      "content-type": "application/json",
      cookie,
    };

    // ------------------------------------------------------------------
    // OP 1 — bulk assign 500 từ vào book rehearsal (đúng biên cap §5.1)
    // ------------------------------------------------------------------
    results.push(
      await timed("bulk assign 500", async () => {
        const res = await fetch(`${BASE_URL}/api/admin/vocabulary/bulk`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: "assign-books",
            wordIds: wordIds.slice(0, BULK_SIZE),
            bookIds: [bookId],
          }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        return { status: res.status, detail: body as Record<string, unknown> };
      }),
    );

    // ------------------------------------------------------------------
    // OP 2 — export CSV 5k giữ filter q (trước promote → đúng 5000 dòng data)
    // ------------------------------------------------------------------
    results.push(
      await timed("export 5k", async () => {
        const res = await fetch(
          `${BASE_URL}/api/admin/vocabulary/export?q=${PREFIX}-`,
          { headers: { cookie } },
        );
        const text = await res.text();
        const parts = text.split("\r\n");
        const dataRows = parts.length - 1 - (parts.at(-1) === "" ? 1 : 0); // trừ header (+ dòng rỗng cuối nếu có)
        return {
          status: res.status,
          detail: { rows: dataRows, bytes: text.length, filename: res.headers.get("content-disposition") },
        };
      }),
    );

    // ------------------------------------------------------------------
    // OP 3 — backfill scoped dry-run (limit mặc định BACKFILL_APPLY_CAP=200
    // → quét đúng 200 từ thiếu audio của book; matched = số từ có entry blob
    // TRONG 200 được quét — fixture 200/500 từ có entry nên matched < 200)
    // ------------------------------------------------------------------
    results.push(
      await timed("backfill scoped 200 dry-run", async () => {
        const res = await fetch(`${BASE_URL}/api/admin/vocabulary/audio-backfill`, {
          method: "POST",
          headers,
          body: JSON.stringify({ scope: { bookId }, dryRun: true }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        const plan = body as {
          plan?: { matched: unknown[]; pending: number; missing: unknown[] };
        };
        return {
          status: res.status,
          detail: {
            matched: plan.plan?.matched ? (plan.plan.matched as unknown[]).length : body.matched,
            pending: plan.plan?.pending ?? body.pending,
            missing: plan.plan?.missing ? (plan.plan.missing as unknown[]).length : body.missing,
          },
        };
      }),
    );

    // ------------------------------------------------------------------
    // OP 4 — promote 20 entry vào book rehearsal (teacher-in-loop meanings)
    // ------------------------------------------------------------------
    const prEntries = (
      await sql<{ id: number }[]>`SELECT id FROM crawl_entries WHERE slug LIKE ${PREFIX + "-p%"} ORDER BY id`
    ).map((r) => r.id);
    if (prEntries.length !== PROMOTE_SIZE) throw new Error(`seed promote entries ${prEntries.length}`);
    results.push(
      await timed("promote 20", async () => {
        const res = await fetch(`${BASE_URL}/api/admin/vocabulary/crawl/promote`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            entryIds: prEntries,
            bookId,
            meanings: Object.fromEntries(prEntries.map((id) => [String(id), `nghĩa promote rehearsal ${id}`])),
          }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        return { status: res.status, detail: body as Record<string, unknown> };
      }),
    );

    // ------------------------------------------------------------------
    // Tổng kết + tự dọn (book + fixture prefix) — helper --apply chạy sau ở CLI
    // ------------------------------------------------------------------
    console.log("\nTIMINGS (route end-to-end qua dev server):");
    for (const r of results) {
      console.log(`  ${r.op.padEnd(30)} ${String(r.ms).padStart(6)}ms  status=${r.status}`);
    }
    const slow = results.find((r) => r.ms > 30_000);
    console.log(slow ? `\n⚠ op > 30s: ${slow.op} — kiểm tra Neon LIMIT-lớn` : "\n✓ mọi op < 30s — không timeout");

    console.log("\nSelf-clean fixture…");
    const cleanStart = performance.now();
    await sql`DELETE FROM books WHERE slug = ${BOOK_SLUG}`;
    await sql`DELETE FROM words WHERE word LIKE ${PREFIX + "-%"}`;
    await sql`DELETE FROM crawl_entries WHERE slug LIKE ${PREFIX + "-%"}`;
    console.log(`  clean xong: ${Math.round(performance.now() - cleanStart)}ms`);

    if (OUT) {
      writeFileSync(
        OUT,
        JSON.stringify({ baseUrl: BASE_URL, at: new Date().toISOString(), results }, null, 2),
      );
      console.log(`Đã ghi ${OUT}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Oxford crawl runner (VU-32 SF-1) — CLI resumable 3 phases:
 *
 *   node scripts/oxford-crawl.ts enumerate [--apply]
 *   node scripts/oxford-crawl.ts fetch    [--limit N] [--slug x] [--apply]
 *   node scripts/oxford-crawl.ts audio    [--limit N] [--apply] [--skip-audio]
 *
 * Flags chung: --rate N (req/s, mặc định 2 — politeness) · --limit N ·
 * --slug x (fetch/audio 1 slug cụ thể) · --skip-audio (phase audio: scan-only
 * — log cái sẽ tải, không tải; phase fetch: accepted no-op — fetch luôn
 * text-only, audio là phase riêng) · --apply (GHI — không có = DRY-RUN).
 *
 * - DRY-RUN MẶC ĐỊNH: không --apply → mọi phase chỉ log, không ghi DB/Blob.
 * - robots.txt runtime-guard TRƯỚC MỌI RUN — Disallow /definition/english/
 *   → exit 1, KHÔNG vòng qua.
 * - 1 token bucket chung pacing mọi outbound (fetch entry + audio mp3).
 * - DB là nguồn trạng thái (crawl_entries.status + audio_*_blob) — kill giữa
 *   chừng chạy lại tiếp đúng chỗ, không dup. Single-runner assumption (chỉ 1
 *   runner tại 1 thời điểm — KHÔNG lock; spec §Kiến trúc documented).
 * - node24 chạy .ts native: import relative CÓ extension; import động SAU
 *   dotenv (ESM static import sẽ hoist trước dotenv.config — pattern
 *   scripts/seed.ts; KHÔNG import storage-server.ts — file đó có `import
 *   "server-only"` không resolve ngoài Next; dùng storage-blob.ts).
 *
 * Exit codes: 0 OK · 1 runtime (robots denied, Blob token thiếu, lỗi không
 * phục hồi) · 2 usage sai.
 */
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });

type Args = {
  phase: "enumerate" | "fetch" | "audio";
  rate: number;
  limit: number;
  slug?: string;
  skipAudio: boolean;
  apply: boolean;
};

function usage(): string {
  return [
    "Usage: node scripts/oxford-crawl.ts <enumerate|fetch|audio> [flags]",
    "",
    "  enumerate [--apply]                        sitemap → crawl_entries pending (dry-run: chỉ đếm)",
    "  fetch [--limit N] [--slug x] [--apply]     fetch + parse entries pending",
    "  audio [--limit N] [--apply] [--skip-audio] mp3 uk/us → Blob audio/oxford/",
    "",
    "Flags: --rate N (mặc định 2 req/s) · --apply (không có = DRY-RUN)",
  ].join("\n");
}

function parseArgs(argv: string[]): Args {
  const phase = argv[0];
  if (phase !== "enumerate" && phase !== "fetch" && phase !== "audio") {
    console.error(usage());
    process.exit(2);
  }
  const args: Args = {
    phase,
    rate: 2,
    limit: 50,
    skipAudio: false,
    apply: false,
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rate") args.rate = Number(argv[++i]);
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--slug") args.slug = argv[++i];
    else if (a === "--skip-audio") args.skipAudio = true;
    else if (a === "--apply") args.apply = true;
    else {
      console.error(`Flag không nhận: ${a}\n${usage()}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.rate) || args.rate <= 0) {
    console.error(`--rate phải > 0 (nhận ${args.rate})`);
    process.exit(2);
  }
  return args;
}

let sql: postgres.Sql;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.apply;
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL thiếu — chạy trong worktree có .env.local (vercel env pull --environment development)",
    );
    process.exit(1);
  }
  sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

  // import động SAU dotenv — ESM static import sẽ hoist trước dotenv.config
  const store = await import("../src/lib/oxford/store.ts");
  const { assertCrawlAllowed, RobotsDeniedError } = await import(
    "../src/lib/oxford/robots.ts"
  );
  const { createTokenBucket, withRetry } = await import(
    "../src/lib/oxford/rate-limit.ts"
  );

  // robots runtime-guard — TRƯỚC MỌI RUN (kể cả enumerate: cùng domain)
  try {
    await withRetry(() => assertCrawlAllowed("/definition/english/"), { retries: 2 });
  } catch (err) {
    console.error(`[robots] ${(err as Error).message}`);
    await sql.end();
    process.exit(1);
  }

  const acquire = createTokenBucket({ rate: args.rate });
  const label = dryRun ? "DRY-RUN" : "APPLY";
  console.log(`[${label}] phase=${args.phase} rate=${args.rate}/s`);

  if (args.phase === "enumerate") {
    const { fetchSlugs } = await import("../src/lib/oxford/sitemap.ts");
    const slugs = await withRetry(() => fetchSlugs(), { retries: 2, baseMs: 2_000 });
    console.log(
      `Sitemap trả về ${slugs.length} slugs /definition/english/ (sample: ${slugs.slice(0, 5).join(", ")}…)`,
    );
    if (dryRun) {
      console.log(
        `DRY-RUN — sẽ upsert ${slugs.length} slugs (slug mới → pending; có sẵn giữ nguyên). Thêm --apply để ghi.`,
      );
    } else {
      const { inserted } = await store.upsertSlugs(sql, slugs);
      console.log(
        `Đã upsert: ${inserted} mới (tổng ${slugs.length}; slug có sẵn giữ nguyên trạng thái).`,
      );
    }
  }

  if (args.phase === "fetch") {
    const { fetchEntry } = await import("../src/lib/oxford/fetch.ts");
    const { parseEntry } = await import("../src/lib/oxford/parse.ts");

    let batch: Array<{ id: number; slug: string; attempts: number }>;
    if (args.slug) {
      // --slug: force 1 slug (debug). Dry-run phải SELECT-only (reviewer nhóm
      // C P1: upsert không guard dry-run = ghi DB trái contract) — slug chưa
      // có trong DB thì chỉ log hướng dẫn --apply.
      const row = await store.findBySlug(sql, args.slug);
      if (!row) {
        if (dryRun) {
          console.log(
            `Slug "${args.slug}" chưa có trong crawl_entries — DRY-RUN không ghi. Chạy --apply để upsert + fetch.`,
          );
        } else {
          await store.upsertSlugs(sql, [args.slug]);
        }
      }
      batch = row ? [{ id: row.id, slug: row.slug, attempts: 0 }] : [];
    } else {
      batch = await store.claimPending(sql, args.limit);
    }
    console.log(
      `Fetch ${batch.length} entries pending${dryRun ? " (dry-run — KHÔNG ghi)" : ""}`,
    );

    let parsed = 0;
    let failed = 0;
    let redirected = 0;
    for (const [i, row] of batch.entries()) {
      await acquire();
      let result;
      try {
        result = await withRetry(() => fetchEntry(row.slug));
      } catch (err) {
        failed += 1;
        console.error(`  [${i + 1}] ${row.slug}: ${(err as Error).message}`);
        if (!dryRun) await store.markFailed(sql, row.id, (err as Error).message);
        continue;
      }
      if (result === null) {
        failed += 1;
        if (!dryRun) await store.markFailed(sql, row.id, "http:404");
        continue;
      }
      const entry = parseEntry(result.html);
      if (entry === null) {
        failed += 1;
        console.error(`  [${i + 1}] ${row.slug}: parse fail (không thấy headword — selector miss?)`);
        if (!dryRun) await store.markFailed(sql, row.id, "parse:no-headword");
        continue;
      }
      parsed += 1;
      if (dryRun) continue;

      // Redirect: dữ liệu sống dưới slug CUỐI (tree_1 → tree = 1 row 'tree').
      // Row sitemap gốc mark parsed + last_error='redirect:<final>' — lần chạy
      // sau không re-fetch; KHÔNG tạo row thứ 3.
      if (result.finalSlug !== row.slug) {
        redirected += 1;
        await store.upsertSlugs(sql, [result.finalSlug]);
        const final = await store.findBySlug(sql, result.finalSlug);
        if (final) await store.markParsed(sql, final.id, entry);
        await sql`
          UPDATE crawl_entries SET status = 'parsed', word = ${entry.headword},
            raw = ${sql.json(entry)},
            attempts = attempts + 1,
            last_error = ${"redirect:" + result.finalSlug}, fetched_at = now()
          WHERE id = ${row.id}
        `;
        console.log(`  [${i + 1}] ${row.slug} → redirect ${result.finalSlug} (lưu dưới slug cuối)`);
        continue;
      }
      await store.markParsed(sql, row.id, entry);

      if ((i + 1) % 50 === 0) {
        console.log(
          `  checkpoint ${i + 1}/${batch.length} (parsed ${parsed}, failed ${failed}, redirect ${redirected})`,
        );
      }
    }
    console.log(
      `Xong fetch: parsed ${parsed}, failed ${failed}, redirect ${redirected}${dryRun ? " (dry-run — không ghi)" : ""}`,
    );
  }

  if (args.phase === "audio") {
    const { syncEntryAudio } = await import("../src/lib/oxford/audio.ts");
    const putBlobAudio = (await import("../src/lib/storage-blob.ts")).putBlobAudio;

    const rows = await store.claimAudioPending(sql, args.limit);
    const targets = args.slug ? rows.filter((r) => r.slug === args.slug) : rows;
    if (args.slug && targets.length === 0) {
      console.log(
        `Slug "${args.slug}" không nằm trong audio queue (${rows.length} rows quét) — đã tải đủ blob / chưa parsed / không có audio URL.`,
      );
    }
    const pendingVariants = targets.reduce(
      (n, r) =>
        n + (r.audioUkUrl && !r.audioUkBlob ? 1 : 0) + (r.audioUsUrl && !r.audioUsBlob ? 1 : 0),
      0,
    );
    console.log(`Audio: ${targets.length} entries, ${pendingVariants} variants → audio/oxford/`);

    if (args.skipAudio || dryRun) {
      // --skip-audio (scan-only) / dry-run: log cái sẽ tải, KHÔNG tải —
      // audit chi phí trước khi tải thật
      for (const r of targets.slice(0, 10)) {
        const will = [
          r.audioUkUrl && !r.audioUkBlob ? "uk" : null,
          r.audioUsUrl && !r.audioUsBlob ? "us" : null,
        ].filter(Boolean);
        console.log(`  sẽ tải ${r.slug}: ${will.join(", ")}`);
      }
      if (args.skipAudio && !dryRun) {
        console.log("(--skip-audio) scan-only — KHÔNG tải. Bỏ --skip-audio + --apply để tải.");
      } else {
        console.log("DRY-RUN — KHÔNG tải. Thêm --apply để tải lên Blob (cần BLOB_READ_WRITE_TOKEN).");
      }
      await sql.end();
      return;
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error(
        "BLOB_READ_WRITE_TOKEN thiếu — phase audio chỉ ghi Blob (helper blob-only, KHÔNG fallback local). Chạy `vercel env pull --environment development`.",
      );
      await sql.end();
      process.exit(1);
    }

    let uploaded = 0;
    let skipped = 0;
    let errors = 0;
    for (const [i, row] of targets.entries()) {
      // 1 token/variant (≤2 mp3/row) — pacing đúng claim 2 req/s (reviewer P2:
      // 1 token/row × 2 mp3 = tới 4 req/s thực)
      await acquire();
      if (row.audioUkUrl && !row.audioUkBlob && row.audioUsUrl && !row.audioUsBlob) {
        await acquire();
      }
      try {
        const res = await withRetry(
          () =>
            syncEntryAudio(row, {
              put: putBlobAudio,
              save: (id, variant, blobUrl) => store.saveAudioBlob(sql, id, variant, blobUrl),
            }),
          { retries: 2 },
        );
        uploaded += res.uploaded;
        skipped += res.skipped;
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("BLOB_READ_WRITE_TOKEN")) {
          // cấu hình sai — dừng toàn bộ, KHÔNG nuốt (helper blob-only P0)
          console.error(`[audio] ${msg}`);
          await sql.end();
          process.exit(1);
        }
        errors += 1;
        console.error(`  [${i + 1}] ${row.slug}: ${msg} (blob chưa ghi — lần chạy sau retry)`);
        continue;
      }
      if ((i + 1) % 50 === 0) {
        console.log(
          `  checkpoint ${i + 1}/${targets.length} (uploaded ${uploaded}, skipped ${skipped}, errors ${errors})`,
        );
      }
    }
    console.log(`Xong audio: uploaded ${uploaded}, skipped ${skipped}, errors ${errors}`);
  }

  const counts = await store.stats(sql);
  console.log(
    `[crawl_entries] pending=${counts.pending} parsed=${counts.parsed} failed=${counts.failed} (failed quá cap retry: ${counts.failedMaxAttempts})`,
  );
  await sql.end();
}

main().catch(async (error) => {
  console.error("[oxford-crawl] lỗi:", error);
  if (sql) await sql.end().catch(() => {});
  process.exit(1);
});

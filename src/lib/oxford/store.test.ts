import dotenv from "dotenv";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { OxfordEntry } from "./parse";
import {
  claimAudioPending,
  claimPending,
  findBySlug,
  markFailed,
  markParsed,
  retryFailed,
  saveAudioBlob,
  stats,
  upsertSlugs,
} from "./store";

dotenv.config({ path: ".env.local" });

/**
 * DB-integration test (DB dev thật — skip khi không DATABASE_URL, CI `npm
 * test` không có env → skip, KHÔNG đỏ). Rows test dùng prefix `zz-test-` —
 * cleanup trước + sau mỗi test (DB dev chung, không để rác nếu crash).
 * Chạy trực tiếp: npm run test:store.
 */

const hasDb = !!process.env.DATABASE_URL;
// Neon dev qua pooler — mỗi query 1-3s RTT; timeout 30s/test (5s mặc định cháy)
const d = (
  name: string,
  fn: () => Promise<void>,
) =>
  it.skipIf(!hasDb)(name, fn, 30_000);

let sql: postgres.Sql;

beforeAll(async () => {
  if (!hasDb) return;
  sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  await sql`DELETE FROM crawl_entries WHERE slug LIKE 'zz-test-%'`;
});

afterEach(async () => {
  if (!hasDb) return;
  await sql`DELETE FROM crawl_entries WHERE slug LIKE 'zz-test-%'`;
});

afterAll(async () => {
  if (!hasDb) return;
  await sql`DELETE FROM crawl_entries WHERE slug LIKE 'zz-test-%'`;
  await sql.end();
});

const treeEntry: OxfordEntry = {
  headword: "tree",
  pos: "noun",
  ipaUk: "/triː/",
  ipaUs: "/triː/",
  audioUkUrl: "https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/x.mp3",
  audioUsUrl: "https://www.oxfordlearnersdictionaries.com/media/english/us_pron/y.mp3",
  cefr: "A1",
  ox3000: true,
  senses: [{ def: "a tall plant", examples: ["an oak tree"] }],
  idioms: [],
  phrasalVerbs: [],
};

describe.skipIf(!hasDb)("store — crawl_entries (DB dev thật)", () => {
  d("upsertSlugs: insert mới → inserted đủ; chạy lại → 0 dup; trộn mới → chỉ mới", async () => {
    expect(await upsertSlugs(sql, ["zz-test-a", "zz-test-b", "zz-test-c"])).toEqual({
      inserted: 3,
    });
    // chạy lại — không dup, không reset trạng thái
    expect(await upsertSlugs(sql, ["zz-test-a", "zz-test-b", "zz-test-c"])).toEqual({
      inserted: 0,
    });
    // đánh dấu b parsed rồi upsert lại — trạng thái GIỮ nguyên
    const row = await findBySlug(sql, "zz-test-b");
    await markParsed(sql, row!.id, treeEntry);
    await upsertSlugs(sql, ["zz-test-a", "zz-test-b", "zz-test-d"]);
    expect(await upsertSlugs(sql, [])).toEqual({ inserted: 0 });
    const b = await findBySlug(sql, "zz-test-b");
    expect(b!.status).toBe("parsed");
    const all = await sql`SELECT slug FROM crawl_entries WHERE slug LIKE 'zz-test-%' ORDER BY slug`;
    expect(all.map((r) => r.slug)).toEqual(["zz-test-a", "zz-test-b", "zz-test-c", "zz-test-d"]);
  });

  d("claimPending: ORDER BY id LIMIT, chỉ pending", async () => {
    await upsertSlugs(sql, ["zz-test-1", "zz-test-2", "zz-test-3"]);
    await markFailed(sql, (await findBySlug(sql, "zz-test-1"))!.id, "http:404");
    const batch = await claimPending(sql, 2);
    expect(batch.map((r) => r.slug)).toEqual(["zz-test-2", "zz-test-3"]);
    expect(batch[0]).toMatchObject({ attempts: 0 });
  });

  d("markParsed: status/word/raw/fields + attempts+1 + fetched_at", async () => {
    await upsertSlugs(sql, ["zz-test-tree"]);
    const row = await findBySlug(sql, "zz-test-tree");
    await markParsed(sql, row!.id, treeEntry);
    const [r] = await sql`SELECT * FROM crawl_entries WHERE slug = 'zz-test-tree'`;
    expect(r.status).toBe("parsed");
    expect(r.word).toBe("tree");
    expect(r.ipa_uk).toBe("/triː/");
    expect(r.cefr).toBe("A1");
    expect(r.ox3000).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.fetched_at).not.toBeNull();
    expect(r.last_error).toBeNull();
    // raw jsonb roundtrip — idioms/phrasalVerbs sống trong raw
    expect(r.raw.headword).toBe("tree");
    expect(r.raw.senses).toHaveLength(1);
    expect(r.raw.senses[0].examples).toEqual(["an oak tree"]);
  });

  d("markFailed: attempts+1, last_error giữ (slice 500)", async () => {
    await upsertSlugs(sql, ["zz-test-fail"]);
    const row = await findBySlug(sql, "zz-test-fail");
    await markFailed(sql, row!.id, "e".repeat(600));
    const [r] = await sql`SELECT * FROM crawl_entries WHERE slug = 'zz-test-fail'`;
    expect(r.status).toBe("failed");
    expect(r.attempts).toBe(1);
    expect(r.last_error).toHaveLength(500);
    // failed + markParsed lại (retry success) → clear last_error, attempts tăng tiếp
    await markParsed(sql, row!.id, treeEntry);
    const [r2] = await sql`SELECT * FROM crawl_entries WHERE slug = 'zz-test-fail'`;
    expect(r2.status).toBe("parsed");
    expect(r2.attempts).toBe(2);
    expect(r2.last_error).toBeNull();
  });

  d("stats: counts theo status + failedMaxAttempts", async () => {
    await upsertSlugs(sql, ["zz-test-s1", "zz-test-s2", "zz-test-s3", "zz-test-s4"]);
    const s1 = await findBySlug(sql, "zz-test-s1");
    const s2 = await findBySlug(sql, "zz-test-s2");
    const s3 = await findBySlug(sql, "zz-test-s3");
    await markParsed(sql, s1!.id, treeEntry);
    await markFailed(sql, s2!.id, "http:500");
    // s3: failed 5 lần → failedMaxAttempts
    for (let i = 0; i < 5; i++) await markFailed(sql, s3!.id, "http:429");
    const counts = await stats(sql);
    expect(counts.pending).toBeGreaterThanOrEqual(1);
    expect(counts.parsed).toBeGreaterThanOrEqual(1);
    expect(counts.failed).toBeGreaterThanOrEqual(2);
    expect(counts.failedMaxAttempts).toBeGreaterThanOrEqual(1);
  });

  d("retryFailed: reset failed attempts<cap → pending GIỮ last_error; quá cap ở lại", async () => {
    await upsertSlugs(sql, ["zz-test-r1", "zz-test-r2"]);
    const r1 = await findBySlug(sql, "zz-test-r1");
    const r2 = await findBySlug(sql, "zz-test-r2");
    await markFailed(sql, r1!.id, "http:404");
    for (let i = 0; i < 5; i++) await markFailed(sql, r2!.id, "http:503");
    const reset = await retryFailed(sql);
    expect(reset).toBeGreaterThanOrEqual(1);
    const [a] = await sql`SELECT * FROM crawl_entries WHERE slug = 'zz-test-r1'`;
    expect(a.status).toBe("pending");
    expect(a.last_error).toBe("http:404"); // giữ để debug
    expect(a.attempts).toBe(1);
    const [b] = await sql`SELECT * FROM crawl_entries WHERE slug = 'zz-test-r2'`;
    expect(b.status).toBe("failed"); // attempts 5 = cap — ở lại failed
  });

  d("saveAudioBlob: uk/us đúng cột", async () => {
    await upsertSlugs(sql, ["zz-test-audio"]);
    const row = await findBySlug(sql, "zz-test-audio");
    await saveAudioBlob(sql, row!.id, "uk", "https://blob.example/audio/oxford/zz-test-audio.uk.mp3");
    await saveAudioBlob(sql, row!.id, "us", "https://blob.example/audio/oxford/zz-test-audio.us.mp3");
    const r = await findBySlug(sql, "zz-test-audio");
    expect(r!.audioUkBlob).toBe("https://blob.example/audio/oxford/zz-test-audio.uk.mp3");
    expect(r!.audioUsBlob).toBe("https://blob.example/audio/oxford/zz-test-audio.us.mp3");
    expect(r!.audioUkUrl).toBeNull(); // provenance URL chưa parse — null
  });

  d("claimAudioPending: chỉ parsed thiếu blob ≥1 variant; đủ blob → không nằm", async () => {
    await upsertSlugs(sql, ["zz-test-aa1", "zz-test-aa2", "zz-test-aa3"]);
    const r1 = await findBySlug(sql, "zz-test-aa1");
    const r2 = await findBySlug(sql, "zz-test-aa2");
    await markParsed(sql, r1!.id, { ...treeEntry, audioUkUrl: MP3, audioUsUrl: null });
    await markParsed(sql, r2!.id, { ...treeEntry, audioUkUrl: MP3, audioUsUrl: MP3 });
    // r1 parsed pending; zz-test-aa3 pending — không có trong audio queue
    const queue = await claimAudioPending(sql, 10);
    expect(queue.map((q) => q.slug)).toContain("zz-test-aa1");
    expect(queue.map((q) => q.slug)).toContain("zz-test-aa2");
    expect(queue.map((q) => q.slug)).not.toContain("zz-test-aa3");
    // tải đủ uk+us cho aa2 → khỏi queue; aa1 chỉ có uk → tải uk là xong
    await saveAudioBlob(sql, r2!.id, "uk", "https://blob.example/x.uk.mp3");
    await saveAudioBlob(sql, r2!.id, "us", "https://blob.example/x.us.mp3");
    await saveAudioBlob(sql, r1!.id, "uk", "https://blob.example/y.uk.mp3");
    const after = await claimAudioPending(sql, 10);
    expect(after.map((q) => q.slug)).not.toContain("zz-test-aa1");
    expect(after.map((q) => q.slug)).not.toContain("zz-test-aa2");
  });
});

const MP3 = "https://www.oxfordlearnersdictionaries.com/media/english/uk_pron/x/x.mp3";

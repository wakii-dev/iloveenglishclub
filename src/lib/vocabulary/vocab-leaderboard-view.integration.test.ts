import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration — leaderboard view migration 0006 trên DB THẬT (template Neon,
 * VU-38 acceptance #1): user CHỈ học vocab (0 attempt dictation) phải hiện
 * weekly; user học cả 2 nguồn KHÔNG duplicate row; all_time khớp profiles.xp.
 *
 * Chạy: ILEC_TEMPLATE_DB_URL=postgres://…ilec_vu37_sf1 node node_modules/vitest/vitest.mjs run <file>
 * Không set env → skip (CI không có DB — unit tests vẫn phủ logic thuần).
 * Fixture prefix `qa-vu37-` — chỉ đụng template DB, KHÔNG production.
 */
const TEMPLATE_URL = process.env.ILEC_TEMPLATE_DB_URL;

const describeDb = TEMPLATE_URL ? describe : describe.skip;

const sql = TEMPLATE_URL ? postgres(TEMPLATE_URL, { prepare: false, max: 1 }) : null;

const USER_VOCAB_ONLY = "qa-vu37-vocabonly";
const USER_DUAL = "qa-vu37-dual";
const BOOK_ID = 9371;

async function seed(db: postgres.Sql) {
  await db.begin(async (tx) => {
    await tx`insert into users (id, email, name) values (${USER_VOCAB_ONLY}, ${USER_VOCAB_ONLY + "@qa.test"}, 'QA VocabOnly'), (${USER_DUAL}, ${USER_DUAL + "@qa.test"}, 'QA Dual') on conflict (id) do nothing`;
    // profiles: xp = write-through đúng như vocab-xp-store ghi
    await tx`insert into profiles (id, display_name, xp) values (${USER_VOCAB_ONLY}, 'QA VocabOnly', 4), (${USER_DUAL}, 'QA Dual', 14) on conflict (id) do nothing`;
    // word fixture (FK vocab_activity)
    await tx`insert into words (id, word, meaning_vi) values (937001, 'qa-vu37-word', 'từ QA') on conflict (id) do nothing`;
    // vocab-only: 3 bước vocab (2+1+1 = 4 XP), 0 attempt dictation
    await tx`insert into vocab_activity (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key) values
      (${USER_VOCAB_ONLY}, 937001, 'learn-complete', true, 2, 'qa-sk', 0, 1, 'qa-ik-1'),
      (${USER_VOCAB_ONLY}, 937001, 'session-step', true, 1, 'qa-sk', 1, 1, 'qa-ik-2'),
      (${USER_VOCAB_ONLY}, 937001, 'session-step', true, 1, 'qa-sk', 2, 1, 'qa-ik-3')`;
    // dual: dictation 10 XP (chain books→units→lessons→lesson_parts→attempts) + vocab 4 XP
    await tx`insert into books (id, slug, title_en, cefr_label, color, sort_order) values (${BOOK_ID}, 'qa-vu37-book', 'QA Book', 'A1', '#000000', 9371) on conflict (id) do nothing`;
    await tx`insert into units (id, book_id, number, title_en, sort_order) values (9371, ${BOOK_ID}, 1, 'QA Unit', 1) on conflict (id) do nothing`;
    await tx`insert into lessons (id, unit_id, number, title_en, kind, vocab_level, sort_order, published) values (9371, 9371, 1, 'QA Lesson', 'dictation', 'A1', 1, true) on conflict (id) do nothing`;
    await tx`insert into lesson_parts (id, lesson_id, sort_order, text) values (9371, 9371, 1, 'qa part text') on conflict (id) do nothing`;
    await tx`insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id) values (${USER_DUAL}, 9371, 'qa part text', 1, 60, 10, '93710000-0000-4000-8000-000000000001')`;
    await tx`insert into vocab_activity (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key) values
      (${USER_DUAL}, 937001, 'learn-complete', true, 4, 'qa-sk', 0, 1, 'qa-ik-4')`;
  });
}

async function cleanup(db: postgres.Sql) {
  await db`delete from profiles where id in (${USER_VOCAB_ONLY}, ${USER_DUAL})`;
  await db`delete from books where id = ${BOOK_ID}`;
  await db`delete from words where id = 937001`;
  // belt-and-braces — cascade (profiles/books) thường đã dọn; no-op khi sạch
  await db`delete from attempts where part_id = 9371`;
  await db`delete from lesson_parts where id = 9371`;
  await db`delete from lessons where id = 9371`;
  await db`delete from units where id = 9371`;
  // profiles xoá rồi nhưng users row còn lại (review C P2.1 — residue)
  await db`delete from users where id in (${USER_VOCAB_ONLY}, ${USER_DUAL})`;
}

describeDb("leaderboard view 0006 — template DB", () => {
  // describeDb chỉ chạy khi TEMPLATE_URL set → sql không null trong scope này
  const db = sql!;
  // Neon direct endpoint autosuspend — cold start query đầu có thể >10s
  const HOOK_TIMEOUT = 60_000;

  beforeAll(async () => {
    await cleanup(db); // fixture re-run idempotent
    await seed(db);
  }, HOOK_TIMEOUT);

  afterEach(async () => {
    await cleanup(db);
    await seed(db);
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    await cleanup(db);
    await db.end();
  }, HOOK_TIMEOUT);

  it("user vocab-only (0 attempt dictation) hiện weekly với đúng tổng XP vocab", { timeout: 30_000 }, async () => {
    const weekly = await db`select scope, display_name, xp from leaderboard where scope = 'weekly' and display_name = 'QA VocabOnly'`;
    expect(weekly).toHaveLength(1);
    expect(weekly[0].xp).toBe(4); // 2 + 1 + 1
  });

  it("user học cả dictation + vocab: MỘT row weekly = 10 + 4 (không duplicate)", { timeout: 30_000 }, async () => {
    const weekly = await db`select xp from leaderboard where scope = 'weekly' and display_name = 'QA Dual'`;
    expect(weekly).toHaveLength(1);
    expect(weekly[0].xp).toBe(14);
  });

  it("all_time khớp profiles.xp (vocab-only 4, dual 14)", { timeout: 30_000 }, async () => {
    const rows = await db`select display_name, xp from leaderboard where scope = 'all_time' and display_name in ('QA VocabOnly', 'QA Dual') order by xp desc`;
    expect(rows).toEqual([
      { display_name: "QA Dual", xp: 14 },
      { display_name: "QA VocabOnly", xp: 4 },
    ]);
  });

  it("migration 0006 idempotent re-run: drop/recreate lại view vẫn query được + kết quả giữ nguyên", { timeout: 30_000 }, async () => {
    const migrationSql = readFileSync(
      path.resolve(__dirname, "../../../drizzle/0006_warm_gunslinger.sql"),
      "utf8",
    )
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of migrationSql) {
      await db.unsafe(statement);
    }
    const weekly = await db`select xp from leaderboard where scope = 'weekly' and display_name = 'QA VocabOnly'`;
    expect(weekly[0].xp).toBe(4);
  });
});

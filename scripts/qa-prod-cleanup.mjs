#!/usr/bin/env node
/**
 * SF-6 prod cleanup 2 PHA (spec VU-24 §5.2) — xoá data test khỏi prod.
 *
 * ⚠ DRY-RUN MẶC ĐỊNH — không xoá gì khi không có --execute. Xoá DB prod là
 * thao tác nguy hiểm nhất story: bắt buộc dry-run + review output trước khi
 * chạy thật (boundary context pack).
 *
 * Pha (a) DB — theo thứ tự FK (context pack):
 *   attempts → user_lesson_progress → daily_activity → lesson_parts
 *   → lessons → units → users (email %@test.ilec)
 *   Content test nhận diện theo prefix title `[QA` (covers `[QA]` + `[QA-SF4]`
 *   — dùng starts_with(), KHÔNG LIKE vì `[` là ký tự wildcard trong LIKE).
 *   attempts RESTRICT lesson_parts → mọi attempt trên part [QA] phải xoá
 *   trước (kể cả của user thật) — chỉ xảy ra nếu user thật học bài [QA].
 *   XP rollback KHÔNG cần: leaderboard là view trên profiles.xp — xoá user
 *   cascade profiles → test user tự biến khỏi leaderboard.
 *
 * Pha (b) Vercel Blob — DB-DRIVEN: audio_path KHÔNG mang prefix [QA] (path là
 *   `audio/{book}/{unit}/{lesson}/{NN}.mp3` theo id nội dung — storage-server.ts),
 *   nên danh sách path xoá = audio_path của parts thuộc content [QA], đọc TỪ DB
 *   TRƯỚC khi xoá DB. Lớp phòng thủ phụ: list Blob theo prefix `[QA` (nếu có
 *   upload nào tự đặt prefix). Không có BLOB_READ_WRITE_TOKEN → SKIP pha b.
 *
 * Dùng:
 *   node scripts/qa-prod-cleanup.mjs                  # dry-run cả 2 pha
 *   node scripts/qa-prod-cleanup.mjs --phase a        # chỉ DB
 *   node scripts/qa-prod-cleanup.mjs --phase b        # chỉ Blob
 *   node scripts/qa-prod-cleanup.mjs --execute        # XOÁ THẬT cả 2 pha
 *   node scripts/qa-prod-cleanup.mjs --execute --phase a
 *
 * Env: DATABASE_URL (pha a) · BLOB_READ_WRITE_TOKEN (pha b — không có = SKIP).
 * Exit: 0 hết (kể cả dry-run/SKIP) · 2 config sai.
 */
import postgres from "postgres";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const phaseIdx = args.indexOf("--phase");
const PHASE = phaseIdx >= 0 ? args[phaseIdx + 1] : "both";
if (!["a", "b", "both"].includes(PHASE)) {
  console.error("--phase chỉ nhận a | b | both");
  process.exit(2);
}
const MODE = EXECUTE ? "EXECUTE (xoá thật)" : "DRY-RUN (không xoá gì)";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL thiếu — set trong env trước khi chạy.");
  process.exit(2);
}
const sql = postgres(url, { prepare: false });
const dbLabel = (() => {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "(không parse được)";
  }
})();

const bucket = {
  users: sql`SELECT id, email FROM users WHERE email LIKE ${"%@test.ilec"}`,
  attemptsOfUsers: sql`
    SELECT a.id FROM attempts a
    JOIN profiles p ON p.id = a.profile_id
    JOIN users u ON u.id = p.user_id
    WHERE u.email LIKE ${"%@test.ilec"}`,
  qaLessonIds: sql`
    (SELECT l.id FROM lessons l WHERE starts_with(l.title_en, ${"[QA"})
                                  OR starts_with(l.title_en, ${"QA-SF"}))
    UNION
    (SELECT l.id FROM lessons l JOIN units un ON un.id = l.unit_id
     WHERE starts_with(un.title_en, ${"[QA"}) OR starts_with(un.title_en, ${"QA-SF"}))`,
  qaUnitIds: sql`SELECT id FROM units WHERE starts_with(title_en, ${"[QA"})
                  OR starts_with(title_en, ${"QA-SF"})`,
};

async function planPhaseA() {
  const plan = {};
  plan["users @test.ilec"] = await bucket.users;
  const userIds = plan["users @test.ilec"].map((r) => r.id);
  plan["attempts (của test users)"] = userIds.length
    ? await bucket.attemptsOfUsers
    : [];
  const lessonRows = await bucket.qaLessonIds;
  const lessonIds = lessonRows.map((r) => r.id);
  plan["lessons [QA*] (trực tiếp + con của unit [QA*])"] = lessonRows;
  const unitRows = await bucket.qaUnitIds;
  plan["units [QA*]"] = unitRows;
  plan["lesson_parts (thuộc lessons [QA*])"] = lessonIds.length
    ? await sql`SELECT id, lesson_id, audio_path FROM lesson_parts
                WHERE lesson_id IN ${sql(lessonIds)} ORDER BY id`
    : [];
  plan["progress (của test users)"] = userIds.length
    ? await sql`SELECT up.id FROM user_lesson_progress up
                JOIN profiles p ON p.id = up.profile_id
                JOIN users u ON u.id = p.user_id
                WHERE u.email LIKE ${"%@test.ilec"}`
    : [];
  plan["progress (trên lessons [QA*], mọi user)"] = lessonIds.length
    ? await sql`SELECT id FROM user_lesson_progress
                WHERE lesson_id IN ${sql(lessonIds)}`
    : [];
  plan["daily_activity (của test users)"] = userIds.length
    ? await sql`SELECT da.id FROM daily_activity da
                JOIN profiles p ON p.id = da.profile_id
                JOIN users u ON u.id = p.user_id
                WHERE u.email LIKE ${"%@test.ilec"}`
    : [];
  // attempts trên part [QA] bởi user THẬT (RESTRICT sẽ chặn xoá part)
  plan["attempts (trên parts [QA*], mọi user)"] = lessonIds.length
    ? await sql`SELECT a.id, a.part_id FROM attempts a
                JOIN lesson_parts lp ON lp.id = a.part_id
                WHERE lp.lesson_id IN ${sql(lessonIds)}`
    : [];
  return plan;
}

async function collectBlobPaths() {
  // audio_path của parts thuộc [QA] — đọc TRƯỚC khi xoá DB (DB-driven)
  const lessonIds = (await bucket.qaLessonIds).map((r) => r.id);
  if (!lessonIds.length) return [];
  const rows = await sql`SELECT DISTINCT audio_path FROM lesson_parts
                         WHERE lesson_id IN ${sql(lessonIds)}
                         AND audio_path IS NOT NULL`;
  return rows.map((r) => r.audio_path);
}

async function runPhaseA() {
  console.log(`\n== PHA (a) DB — db=${dbLabel} — ${MODE} ==`);
  const plan = await planPhaseA();
  let total = 0;
  for (const [label, rows] of Object.entries(plan)) {
    total += rows.length;
    const sample = rows
      .slice(0, 5)
      .map((r) => JSON.stringify(r.email ?? r))
      .join(", ");
    console.log(
      `  ${label}: ${rows.length}${sample ? ` — vd ${sample}${rows.length > 5 ? " …" : ""}` : ""}`,
    );
  }
  if (total === 0) {
    console.log("  Sạch — không có data test nào khớp.");
    return;
  }
  if (!EXECUTE) {
    console.log("  [DRY-RUN] Không xoá gì. Chạy lại với --execute để xoá thật.");
    return;
  }
  // Thứ tự FK (context pack): attempts → progress → daily_activity →
  // parts → lessons → units → users
  const lessonIds = plan["lessons [QA*] (trực tiếp + con của unit [QA*])"].map((r) => r.id);
  const unitIds = plan["units [QA*]"].map((r) => r.id);
  const userIds = plan["users @test.ilec"].map((r) => r.id);
  const step = async (label, query) => {
    const rows = await query;
    console.log(`  DEL ${label}: ${rows.count}`);
  };
  await step("attempts (parts [QA*], mọi user)", lessonIds.length
    ? sql`DELETE FROM attempts WHERE part_id IN
          (SELECT id FROM lesson_parts WHERE lesson_id IN ${sql(lessonIds)})`
    : sql`DELETE FROM attempts WHERE false`);
  await step("attempts (test users)", userIds.length
    ? sql`DELETE FROM attempts WHERE profile_id IN
          (SELECT id FROM profiles WHERE user_id IN ${sql(userIds)})`
    : sql`DELETE FROM attempts WHERE false`);
  await step("progress (lessons [QA*], mọi user)", lessonIds.length
    ? sql`DELETE FROM user_lesson_progress WHERE lesson_id IN ${sql(lessonIds)}`
    : sql`DELETE FROM user_lesson_progress WHERE false`);
  await step("progress (test users)", userIds.length
    ? sql`DELETE FROM user_lesson_progress WHERE profile_id IN
          (SELECT id FROM profiles WHERE user_id IN ${sql(userIds)})`
    : sql`DELETE FROM user_lesson_progress WHERE false`);
  await step("daily_activity (test users)", userIds.length
    ? sql`DELETE FROM daily_activity WHERE profile_id IN
          (SELECT id FROM profiles WHERE user_id IN ${sql(userIds)})`
    : sql`DELETE FROM daily_activity WHERE false`);
  await step("lesson_parts (lessons [QA*])", lessonIds.length
    ? sql`DELETE FROM lesson_parts WHERE lesson_id IN ${sql(lessonIds)}`
    : sql`DELETE FROM lesson_parts WHERE false`);
  await step("lessons [QA*]", lessonIds.length
    ? sql`DELETE FROM lessons WHERE id IN ${sql(lessonIds)}`
    : sql`DELETE FROM lessons WHERE false`);
  await step("units [QA*]", unitIds.length
    ? sql`DELETE FROM units WHERE id IN ${sql(unitIds)}`
    : sql`DELETE FROM units WHERE false`);
  await step("users @test.ilec (cascade profiles/accounts/sessions)", userIds.length
    ? sql`DELETE FROM users WHERE id IN ${sql(userIds)}`
    : sql`DELETE FROM users WHERE false`);
  console.log("  (XP không rollback — leaderboard là view trên profiles, test profile đã xoá cascade)");
}

async function runPhaseB() {
  console.log(`\n== PHA (b) Vercel Blob — ${MODE} ==`);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("  SKIP: BLOB_READ_WRITE_TOKEN không có trong env (GAP #3d).");
    return;
  }
  const { del, list } = await import("@vercel/blob");
  const paths = await collectBlobPaths();
  console.log(`  DB-driven paths (audio của content [QA*]): ${paths.length}`);
  for (const p of paths) console.log(`    - ${p}`);
  // Lớp phòng thủ: list prefix [QA (upload nào tự đặt prefix [QA])
  let prefixHits = [];
  try {
    for await (const blob of list({ prefix: "[QA" })) prefixHits.push(blob.pathname);
  } catch (err) {
    console.log(`  list prefix [QA lỗi (không chặn): ${String(err).slice(0, 120)}`);
  }
  console.log(`  Prefix [QA* trên Blob: ${prefixHits.length}`);
  for (const p of prefixHits) console.log(`    - ${p}`);
  const all = [...new Set([...paths, ...prefixHits])];
  if (all.length === 0) {
    console.log("  Sạch — không có blob test nào.");
    return;
  }
  if (!EXECUTE) {
    console.log("  [DRY-RUN] Không xoá gì. Chạy lại với --execute để xoá thật.");
    return;
  }
  for (const p of all) {
    await del(p);
    console.log(`  DEL blob: ${p}`);
  }
}

if (PHASE === "a" || PHASE === "both") await runPhaseA();
if (PHASE === "b" || PHASE === "both") await runPhaseB();
console.log(`\nXong (${MODE}, pha ${PHASE}, db=${dbLabel}).`);
await sql.end();

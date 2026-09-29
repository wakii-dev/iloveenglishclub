/**
 * Cleanup test-data DB local (SF-1 task 10 — spec VU-24 §4 registry +
 * quy ước fixture `sf{N}-…@test.ilec`). Xoá users theo email pattern
 * `*@test.ilec` — FK CASCADE dọn theo: profiles → attempts / daily_activity
 * / user_lesson_progress (verified pg_constraint confdeltype='c').
 *
 * DRY-RUN mặc định: chỉ LIỆT KÊ sẽ xoá gì (counts theo bảng). Thực chạy:
 * `--yes`. KHÔNG đụng content (units/lessons — pollution content e2e admin
 * dọn riêng bằng SQL FK-order, xem evidence qa-hardening/baseline.md QA-1).
 * KHÔNG đụng admin (admin@ilec.dev không khớp pattern).
 *
 * Chạy: node scripts/cleanup-test-data.ts [--yes] [DATABASE_URL từ .env.local]
 */
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DRY_RUN = !process.argv.includes("--yes");
const PATTERN = "%@test.ilec";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL thiếu — set trong .env.local");
  process.exit(2);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const count = async (query: string): Promise<number> => {
  const rows = await sql.unsafe(query) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
};

const [users, attempts, progress, activity] = await Promise.all([
  count(
    `SELECT count(*) AS n FROM users WHERE email LIKE '${PATTERN}'`,
  ),
  count(
    `SELECT count(*) AS n FROM attempts WHERE user_id IN
       (SELECT id FROM profiles WHERE id IN
         (SELECT id FROM users WHERE email LIKE '${PATTERN}'))`,
  ),
  count(
    `SELECT count(*) AS n FROM user_lesson_progress WHERE user_id IN
       (SELECT id FROM profiles WHERE id IN
         (SELECT id FROM users WHERE email LIKE '${PATTERN}'))`,
  ),
  count(
    `SELECT count(*) AS n FROM daily_activity WHERE user_id IN
       (SELECT id FROM profiles WHERE id IN
         (SELECT id FROM users WHERE email LIKE '${PATTERN}'))`,
  ),
]);

console.log(`Target DB: ${process.env.DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")}`);
console.log(`Pattern:   email LIKE '${PATTERN}'  (FK cascade: profiles → attempts/daily_activity/user_lesson_progress)`);
console.log(`Sẽ xoá:  users=${users} · attempts=${attempts} · progress=${progress} · daily_activity=${activity}`);
console.log(`Mode:    ${DRY_RUN ? "DRY-RUN (không xoá — thêm --yes để thực)" : "THỰC CHẠY"}`);

if (DRY_RUN) {
  const emails = await sql`
    SELECT email FROM users WHERE email LIKE ${PATTERN} ORDER BY email LIMIT 30`;
  for (const r of emails) console.log(`  - ${r.email}`);
  if (users > emails.length) console.log(`  … và ${users - emails.length} nữa`);
  await sql.end();
  process.exit(0);
}

if (users === 0) {
  console.log("Không có gì để xoá.");
  await sql.end();
  process.exit(0);
}

// users là gốc cascade duy nhất (profiles + 3 bảng con đều CASCADE)
await sql.unsafe(`DELETE FROM users WHERE email LIKE '${PATTERN}'`);

const [leftUsers, leftAttempts, leftProgress, leftActivity] = await Promise.all([
  count(`SELECT count(*) AS n FROM users WHERE email LIKE '${PATTERN}'`),
  count(
    `SELECT count(*) AS n FROM attempts WHERE user_id NOT IN (SELECT id FROM profiles)`,
  ),
  count(
    `SELECT count(*) AS n FROM user_lesson_progress WHERE user_id NOT IN (SELECT id FROM profiles)`,
  ),
  count(
    `SELECT count(*) AS n FROM daily_activity WHERE user_id NOT IN (SELECT id FROM profiles)`,
  ),
]);

console.log(`Đã xoá. Còn lại pattern: users=${leftUsers}`);
console.log(`Orphan check (phải 0 hết): attempts=${leftAttempts} · progress=${leftProgress} · daily_activity=${leftActivity}`);
if (leftUsers + leftAttempts + leftProgress + leftActivity > 0) {
  console.error("FAIL: còn sót/orphan — kiểm tra FK cascade.");
  await sql.end();
  process.exit(1);
}
await sql.end();

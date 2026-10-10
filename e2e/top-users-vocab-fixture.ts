import bcrypt from "bcryptjs";
import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite top-users-vocab 3320 (vocab-memrise SF-5, VU-42 — context
 * pack #2). Seed TOÀN BỘ trong globalSetup TRƯỚC webServer bind: /top-users
 * là ISR revalidate=60 — user seed sau khi server sống sẽ KHÔNG xuất hiện
 * (cache cũ), seed trước bind thì render đầu tiên đã chứa dữ liệu.
 *
 * Pin kỳ vọng user `qa-tu-vocab` (vocab-only — 0 row `attempts`):
 *  - vocab_activity tuần này: 3 learn-complete × 4xp + 30 session-step × 1xp
 *    = 42 → weekly /top-users hiện "QA TU Vocab" 42 (phép CỘNG vocab)
 *  - profiles.xp = 5000 ≠ 42 (CỐTÝ — tách nguồn: nếu view weekly regression
 *    đọc thẳng profiles.xp thì weekly sai 5000 → test bắt được; all_time = 5000)
 *  - daily_activity hôm nay + hôm qua, profiles.streak_count = 2 → /me
 *    streak 2 dù ngày chỉ học vocab (presence giữ streak — SF-1 session
 *    engine recompute khi ngày chuyển active)
 *
 * Reset idempotent: xoá sạch row cũ của user + word qa-tu trước khi seed.
 * Teardown xoá word QA (cascade vocab_activity) + user/profile/daily_activity.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const TU_EMAIL = "qa-tu-vocab@test.ilec";
export const TU_NAME = "QA TU Vocab";
export const TU_PASSWORD = "password123";
/** XP vocab tuần này (SUM vocab_activity.xp) — giá trị bảng weekly. */
export const TU_XP = 42;
/** profiles.xp — CỐ TÝ ≠ TU_XP: tách nguồn weekly (cộng activity) và
 * all_time (đọc profiles) — view regression đọc nhầm nguồn sẽ sai số.
 * 5000 > mọi user QA dư (1248) → không rơi khỏi top-50 limit của view. */
export const TU_PROFILE_XP = 5000;
export const TU_WORD = "qa-tu-word";

/** XP tổng của user theo DB — spec dùng đối chiếu all_time hiển thị. */
export async function tuProfileXp(): Promise<number> {
  const c = client();
  const rows: { xp: number }[] = await c`
    select p.xp from profiles p join users u on u.id = p.id
    where u.email = ${TU_EMAIL}
  `;
  return rows[0]?.xp ?? 0;
}

export async function ensureTopUsersFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('vocab_activity') as va,
           to_regclass('daily_activity') as da, to_regclass('leaderboard') as lb
  `;
  if (
    !tables[0]?.w ||
    !tables[0]?.va ||
    !tables[0]?.da ||
    !tables[0]?.lb
  ) {
    throw new Error(
      "bảng words/vocab_activity/daily_activity/view leaderboard chưa đủ — áp dụng migration (drizzle 0002+0005+0006) trước khi chạy suite top-users 3320",
    );
  }

  await resetTopUsersFixture();

  const passwordHash = await bcrypt.hash(TU_PASSWORD, 10);
  await c.begin(async (tx) => {
    const [word]: { id: number }[] = await tx`
      insert into words (word, meaning_vi) values (${TU_WORD}, 'nghĩa TU')
      returning id
    `;
    const [user]: { id: string }[] = await tx`
      insert into users (id, email, name, password_hash)
      values (${crypto.randomUUID()}, ${TU_EMAIL}, ${TU_NAME}, ${passwordHash})
      returning id
    `;
    await tx`
      insert into profiles (id, display_name, xp, streak_count)
      values (${user.id}, ${TU_NAME}, ${TU_PROFILE_XP}, 2)
    `;
    // 3 learn-complete × 4xp — lần-đầu-trong-ngày rule không cần vì seed thẳng
    for (let i = 0; i < 3; i++) {
      await tx`
        insert into vocab_activity
          (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key, created_at)
        values (${user.id}, ${word.id}, 'learn-complete', true, 4,
                'qa-tu-seed', 0, 1, ${"qa-tu-seed:learn:" + i}, now())
      `;
    }
    // 30 bước review (session-step) × 1xp — tổng vocab_activity.xp = 42
    // = profiles.xp (kind CHECK chỉ nhận 'learn-complete'|'session-step')
    for (let i = 0; i < 30; i++) {
      await tx`
        insert into vocab_activity
          (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key, created_at)
        values (${user.id}, ${word.id}, 'session-step', true, 1,
                'qa-tu-seed', 0, 1, ${"qa-tu-seed:review:" + i}, now())
      `;
    }
    // presence hôm nay + hôm qua — streak 2 dù 0 dictation attempt
    await tx`
      insert into daily_activity (user_id, date, vocab_steps)
      values
        (${user.id}, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 33),
        (${user.id}, ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 1), 3)
    `;
  });
}

/** Xoá sạch state của fixture user (idempotent — chạy được khi chưa tồn tại). */
async function resetTopUsersFixture(): Promise<void> {
  const c = client();
  await c.begin(async (tx) => {
    await tx`
      delete from vocab_activity where user_id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`
      delete from daily_activity where user_id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`
      delete from attempts where user_id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`
      delete from user_word_progress where user_id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`
      delete from sessions where user_id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`
      delete from profiles where id in (
        select id from users where email = ${TU_EMAIL})
    `;
    await tx`delete from users where email = ${TU_EMAIL}`;
    await tx`delete from words where word = ${TU_WORD}`;
  });
}

/** Self-clean cuối run — word QA cascade vocab_activity; còn lại xoá theo user. */
export async function cleanupTopUsersFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  await c`delete from words where word = ${TU_WORD}`;
  await c`
    delete from daily_activity where user_id in (
      select id from users where email = ${TU_EMAIL})
  `;
  await c`
    delete from profiles where id in (
      select id from users where email = ${TU_EMAIL})
  `;
  await c`delete from users where email = ${TU_EMAIL}`;
}

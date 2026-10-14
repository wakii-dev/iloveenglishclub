import { randomUUID } from "node:crypto";
import postgres from "postgres";
import dotenv from "dotenv";
import { selectQuests } from "../src/lib/today/quests";
import { addDays, vnToday } from "../src/lib/gamification/streak";

/**
 * Fixture DB suite /today 3321 (daily-journey SF-3, VU-51 — pattern
 * vocabulary-dashboard-fixture). Books template `level-5` + words
 * `qa-today-w*` seed globalSetup; SỐ LIỆU per-user seed cho 2 user PIN:
 *
 * - **User A** (quest/badge spec) — quest-hash RUNTIME SEARCH (context pack
 *   §6 pin): selection đổi theo (userId, date) nên setup TÌM user-id tại
 *   runtime — lặp tạo `qa-today-a*` gọi selectQuests(id, vnToday()) tới set
 *   chứa `q-review-5`, seed user ĐÓ. Seed AN-TOÀN cho MỌI set: listen 0
 *   (goal 10) · planted/practiced 2 (goal 5) · parts 0 · reviewed 0 →
 *   KHÔNG quest nào pre-done ở visit đầu (auto-record chỉ sau hoạt động
 *   thật). 4 quest_completions HÔM QUA → review 5 từ đúng = quest thứ 5 ⇒
 *   badge `quests-5` đúng 1 lần.
 * - **User B** (page + dot spec) — search set KHÔNG chứa
 *   {q-review-5, q-listen-goal, q-plant-3} (visit /today sạch — không
 *   auto-record/toast nhiễu). Seed: goals 5/5 · listen_ms hôm nay 300000
 *   (5/5 phút done) · practiced 3/5 (learn-complete ×3) · 2 từ due (W6,W7)
 *   → ôn đúng 2 từ = goal kép (dot tắt QUA EVENT, không reload) · lesson
 *   progress level-5 (đang đọc — dictation next + continue target).
 *
 * users INSERT SQL trực tiếp (register UI tạo user random không kiểm soát
 * được id/hash-set): bcrypt hash tĩnh `password123` — login qua UI form.
 * ⚠ users.id KHÔNG DB default (drizzle $defaultFn) → tự sinh UUID.
 * do-today dấu mốc = VN-day (vnToday hệ — KHÔNG UTC).
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const TODAY_BOOK_SLUG = "level-5";
export const TODAY_BOOK_ID = 5;
export const QA_PASSWORD = "password123";
export const QA_PASSWORD_HASH =
  "$2b$10$Jut1K2KJyl.J36ZtDHwPF.7/XYQn568B/Idm83RHBJZWO2/Gd8z7e";

export const TODAY_WORDS = Array.from({ length: 7 }, (_, i) => ({
  word: `qa-today-w${i + 1}`,
  meaning: `từ QA today ${i + 1}`,
}));

export type TodayUser = { id: string; email: string };

const wordName = (n: number) => `qa-today-w${n}`;

/** Tạo/tái dùng user (id ổn định theo email) — trả id. */
async function upsertUser(
  tx: postgres.TransactionSql,
  email: string,
  name: string,
): Promise<string> {
  const existing: { id: string }[] =
    await tx`select id from users where email = ${email}`;
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await tx`
    insert into users (id, name, email, password_hash, email_verified)
    values (${id}, ${name}, ${email}, ${QA_PASSWORD_HASH}, now())
  `;
  return id;
}

/**
 * Quest-hash runtime search (context pack §6 — chống flaky theo ngày):
 * thử tối đa 60 id; match theo predicate trên selectQuests(id, vnToday()).
 */
async function findPinnedUser(
  tx: postgres.TransactionSql,
  prefix: string,
  name: string,
  matches: (ids: ReturnType<typeof selectQuests>) => boolean,
): Promise<TodayUser> {
  const today = vnToday(new Date());
  for (let n = 0; n < 60; n++) {
    const email = `qa-today-${prefix}${n === 0 ? "" : `-${n}`}@test.ilec`;
    const id = await upsertUser(tx, email, name);
    if (matches(selectQuests(id, today))) return { id, email };
  }
  throw new Error(
    `quest-hash search: không tìm thấy user khớp trong 60 lần — pool/selection đổi?`,
  );
}

/**
 * Reset trạng thái HÔM NAY của user (chống cross-run nhiễm): session-step
 * hôm nay + quest_completions hôm nay + badges. Suite re-run về đúng baseline
 * (learn-complete seed giữ — idempotency-keyed). without: run trước đã review
 * → reviewedToday/practiced dính số cũ → q-review-5 pre-done/toast không
 * fire lại.
 */
async function resetDailyState(
  tx: postgres.TransactionSql,
  uid: string,
): Promise<void> {
  const today = vnToday(new Date());
  await tx`
    delete from vocab_activity
    where user_id = ${uid} and kind = 'session-step'
      and (created_at at time zone 'Asia/Ho_Chi_Minh')::date = ${today}::date
  `;
  await tx`
    delete from quest_completions
    where user_id = ${uid} and date = ${today}::date
  `;
  await tx`delete from user_badges where user_id = ${uid}`;
}

async function seedProgressAndActivity(
  tx: postgres.TransactionSql,
  uid: string,
  opts: {
    goalMinutes: number;
    goalWords: number;
    xp: number;
    streakCount: number;
    listenMsToday: number;
    learnCompleteWords: number[];
    dueWords: number[];
    futureWords: number[];
  },
): Promise<void> {
  await tx`
    insert into profiles (id, display_name, locale, xp, streak_count,
      daily_goal_minutes, daily_goal_words, shield_credits)
    values (${uid}, 'QA Today', 'vi', ${opts.xp}, ${opts.streakCount},
      ${opts.goalMinutes}, ${opts.goalWords}, 0)
    on conflict (id) do update set
      xp = ${opts.xp}, streak_count = ${opts.streakCount},
      daily_goal_minutes = ${opts.goalMinutes},
      daily_goal_words = ${opts.goalWords}, shield_credits = 0
  `;

  if (opts.listenMsToday > 0) {
    // due = Date param (postgres.js serialize Date; chuỗi SQL + cast →
    // RangeError — lesson SF-4)
    const today = vnToday(new Date());
    const yesterday = addDays(vnToday(new Date()), -1);
    await tx`
      insert into daily_activity (user_id, date, listen_ms, parts_done, vocab_steps)
      values
        (${uid}, ${today}, ${opts.listenMsToday}, 0, 3),
        (${uid}, ${yesterday}, 60_000, 1, 1)
      on conflict (user_id, date) do update set
        listen_ms = excluded.listen_ms, parts_done = excluded.parts_done,
        vocab_steps = excluded.vocab_steps
    `;
  }

  // grant-ledger tháng NAY đã tồn tại → snapshot RETURNING-empty → credits
  // giữ 0 (deterministic — không thì visit /today đầu tiên tự grant +1)
  await tx`
    insert into shield_grants (user_id, month)
    values (${uid}, ${vnToday(new Date()).slice(0, 7)})
    on conflict (user_id, month) do nothing
  `;

  // learn-complete hôm nay — practiced/planted seed (idempotency_key riêng)
  for (const n of opts.learnCompleteWords) {
    await tx`
      insert into vocab_activity
        (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key, created_at)
      select ${uid}, id, 'learn-complete', true, 4, 'qa-today-seed', 0, 1,
             ${"qa-today-seed:" + uid + ":" + n}, now()
      from words where word = ${wordName(n)}
      on conflict (idempotency_key) do nothing
    `;
  }

  // progress rows — due quá khứ (review queue) hoặc tương lai
  const dueDate = new Date(Date.now() - 3_600_000);
  const futureDate = new Date(Date.now() + 48 * 3_600_000);
  for (const n of [...opts.dueWords, ...opts.futureWords]) {
    const dueAt = opts.dueWords.includes(n) ? dueDate : futureDate;
    await tx`
      insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
      select ${uid}, id, 2.5, 1, ${dueAt}, 1
      from words where word = ${wordName(n)}
      on conflict (user_id, word_id) do update set
        ease = 2.5, interval_days = 1, due_at = ${dueAt}, reps = 1
    `;
  }
}

export async function ensureTodayWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('user_word_progress') as uwp,
           to_regclass('vocab_activity') as va, to_regclass('daily_activity') as da,
           to_regclass('quest_completions') as qc, to_regclass('user_badges') as ub
  `;
  const t = tables[0]!;
  if (!t.w || !t.bw || !t.uwp || !t.va || !t.da || !t.qc || !t.ub) {
    throw new Error(
      "bảng words/book_words/user_word_progress/vocab_activity/daily_activity/quest_completions/user_badges chưa đủ — áp migration 0007 trước khi chạy suite today 3321",
    );
  }

  await c.begin(async (tx) => {
    const books: { id: number }[] =
      await tx`select id from books where slug = ${TODAY_BOOK_SLUG}`;
    if (!books[0]) {
      throw new Error(
        `book ${TODAY_BOOK_SLUG} không có — DB template sai (cần template ilec_sf2..sf5)`,
      );
    }
    let order = 100; // cuối book_words level-5 — không đụng order fixture khác
    for (const w of TODAY_WORDS) {
      order += 1;
      const inserted: { id: number }[] = await tx`
        insert into words (word, meaning_vi)
        values (${w.word}, ${w.meaning})
        on conflict (word) do update set meaning_vi = excluded.meaning_vi
        returning id
      `;
      await tx`
        insert into book_words (book_id, word_id, "order")
        values (${books[0].id}, ${inserted[0]!.id}, ${order})
        on conflict (book_id, word_id) do update set "order" = excluded."order"
      `;
    }
  });
}

/** Seed user A (quest/badge) — quest-hash runtime search q-review-5. */
export async function seedTodayUserA(): Promise<TodayUser> {
  const c = client();
  const yesterday = addDays(vnToday(new Date()), -1);
  return c.begin(async (tx) => {
    const user = await findPinnedUser(tx, "a", "QA Today A", (ids) =>
      ids.includes("q-review-5"),
    );
    await resetDailyState(tx, user.id);
    await seedProgressAndActivity(tx, user.id, {
      goalMinutes: 10, // listen 0 → minutes NOT done (mọi set an toàn)
      goalWords: 5,
      xp: 500,
      streakCount: 1,
      listenMsToday: 0, // KHÔNG daily_activity hôm nay
      learnCompleteWords: [1, 2], // planted 2 (<3 — q-plant-3 không pre-done)
      dueWords: [3, 4, 5, 6, 7], // 5 từ due → review đúng 5 = q-review-5
      futureWords: [],
    });
    // 4 quest_completions HÔM QUA — review quest thứ 5 ⇒ badge quests-5
    for (const questId of [
      "q-parts-3",
      "q-parts-5",
      "q-listen-goal",
      "q-plant-3",
    ]) {
      await tx`
        insert into quest_completions (user_id, date, quest_id)
        values (${user.id}, ${yesterday}, ${questId})
        on conflict (user_id, date, quest_id) do nothing
      `;
    }
    return user;
  });
}

/** Seed user B (page + dot) — set sạch (không pre-done quest nào ở seed). */
export async function seedTodayUserB(): Promise<TodayUser> {
  const c = client();
  return c.begin(async (tx) => {
    const user = await findPinnedUser(tx, "b", "QA Today B", (ids) => {
      const set = new Set<string>(ids);
      return (
        !set.has("q-review-5") &&
        !set.has("q-listen-goal") &&
        !set.has("q-plant-3")
      );
    });
    await resetDailyState(tx, user.id);
    await seedProgressAndActivity(tx, user.id, {
      goalMinutes: 5, // listen 5/5 done
      goalWords: 5, // practiced 3/5 → dot ON; ôn 2 từ → goal kép
      xp: 1248,
      streakCount: 2,
      listenMsToday: 300_000,
      learnCompleteWords: [1, 2, 3], // practiced 3
      dueWords: [6, 7], // 2 từ due → review đúng 2 = practiced 5
      futureWords: [4, 5],
    });
    // đang đọc level-5 — dictation next + continue target ưu tiên sách này
    await tx`
      insert into user_lesson_progress (user_id, lesson_id, done_parts)
      select ${user.id}, l.id, 1
      from lessons l join units u on u.id = l.unit_id
      join books b on b.id = u.book_id
      where b.slug = ${TODAY_BOOK_SLUG}
      order by u.sort_order, l.number
      limit 1
      on conflict (user_id, lesson_id) do nothing
    `;
    await tx`delete from user_badges where user_id = ${user.id}`;
    return user;
  });
}

/** Self-clean cuối run — xoá users + words QA (cascade progress/activity). */
export async function cleanupTodayFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('users') as u, to_regclass('words') as w`;
  if (!tables[0]?.u) return;
  await c`delete from users where email like 'qa-today-%@test.ilec'`;
  if (tables[0]?.w) await c`delete from words where word like 'qa-today-w%'`;
}

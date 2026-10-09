import postgres from "postgres";
import dotenv from "dotenv";

/**
 * Fixture DB suite dashboard 3319 (vocab-memrise SF-4, VU-41) — pattern
 * vocabulary-hub-fixture.ts. Books Template DB `level-5`/`level-6` + words
 * `qa-dash-*` seed bởi globalSetup; SỐ LIỆU per-user (progress/vocab_activity/
 * daily_activity/profiles) seed bởi spec sau khi đăng ký — pin kỳ vọng:
 *
 *  - garden distribution = [3,2,1,1,1,0,0,5] (13 rows progress):
 *      stage0 = từ 11,12,13 (reps 0, seeded) · stage1 = 1 (iv0), 2 (iv1) ·
 *      stage2 = 3 (iv3) · stage3 = 4 (iv7) · stage4 = 5 (iv20) ·
 *      stage7 = 6..10 (iv250)
 *  - continue = level-5 Level 2 · Từ 11–20 · planted 0/10 · CTA "10 từ mới"
 *      (level 1 = từ 1..10 planted hết, từ 11-13 reps=0 đầu tiên)
 *  - plantedToday = 3 (vocab_activity learn-complete today) / goal 5
 *  - streak = 2 (daily_activity hôm nay + hôm qua); dueToday = 1 (từ 1 -1h)
 *  - XP = 1248; lộ trình 2 sách: level-5 10/25 Đang học, level-6 0/10 Chưa
 *
 * GATE: bảng words/book_words/user_word_progress/vocab_activity/daily_activity
 * + books level-5/level-6 phải có — thiếu thì globalSetup fail rõ.
 */
dotenv.config({ path: ".env.local" });

let sql: postgres.Sql | null = null;

function client(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

export const DASH_BOOK_SLUG = "level-5";
export const DASH_BOOK2_SLUG = "level-6";

export const DASH_WORDS_L5 = Array.from({ length: 25 }, (_, i) => ({
  word: `qa-dash-l5-${String(i + 1).padStart(2, "0")}`,
  ipa: null,
  meaning: `từ QA dash L5 ${i + 1}`,
}));

export const DASH_WORDS_L6 = Array.from({ length: 10 }, (_, i) => ({
  word: `qa-dash-l6-${String(i + 1).padStart(2, "0")}`,
  ipa: null,
  meaning: `từ QA dash L6 ${i + 1}`,
}));

const wordName = (n: number) => `qa-dash-l5-${String(n).padStart(2, "0")}`;

export async function ensureDashboardWordsFixture(): Promise<void> {
  const c = client();
  const tables = await c`
    select to_regclass('words') as w, to_regclass('book_words') as bw,
           to_regclass('user_word_progress') as uwp,
           to_regclass('vocab_activity') as va, to_regclass('daily_activity') as da
  `;
  if (
    !tables[0]?.w ||
    !tables[0]?.bw ||
    !tables[0]?.uwp ||
    !tables[0]?.va ||
    !tables[0]?.da
  ) {
    throw new Error(
      "bảng words/book_words/user_word_progress/vocab_activity/daily_activity chưa đủ — áp dụng migration (drizzle 0002+0005) trước khi chạy suite dashboard 3319",
    );
  }
  const books = await c`
    select id, slug from books where slug in (${DASH_BOOK_SLUG}, ${DASH_BOOK2_SLUG})
  `;
  if (books.length < 2) {
    throw new Error(
      `books ${DASH_BOOK_SLUG}/${DASH_BOOK2_SLUG} không đủ — DB template sai (cần template ilec_sf2..sf5)`,
    );
  }

  await c.begin(async (tx) => {
    for (const [slug, words] of [
      [DASH_BOOK_SLUG, DASH_WORDS_L5],
      [DASH_BOOK2_SLUG, DASH_WORDS_L6],
    ] as const) {
      const [book] = await tx`select id from books where slug = ${slug}`;
      let order = 0;
      for (const w of words) {
        order += 1;
        const inserted: { id: number }[] = await tx`
          insert into words (word, meaning_vi)
          values (${w.word}, ${w.meaning})
          on conflict (word) do update set meaning_vi = excluded.meaning_vi
          returning id
        `;
        await tx`
          insert into book_words (book_id, word_id, "order")
          values (${book.id}, ${inserted[0]!.id}, ${order})
          on conflict (book_id, word_id) do update set "order" = excluded."order"
        `;
      }
    }
  });
}

/**
 * Số liệu cá nhân theo pin ở header — gọi SAU khi user đăng ký qua UI.
 */
export async function seedDashboardProgress(email: string): Promise<void> {
  const c = client();
  const users: { id: string }[] = await c`
    select id from users where email = ${email}
  `;
  const user = users[0];
  if (!user) throw new Error(`user ${email} chưa đăng ký — spec phải register trước`);
  const uid = user.id;

  await c.begin(async (tx) => {
    // progress 13 rows — distribution [3,2,1,1,1,0,0,5]; từ 1 due quá khứ.
    // due = Date param (postgres.js serialize Date native; chuỗi SQL
    // expression + cast ::timestamptz → RangeError Invalid time value)
    const baseMs = Date.now();
    const due = (hours: number) => new Date(baseMs + hours * 3_600_000);
    const progressRows: [number, number, number, Date][] = [
      // [từ, reps, intervalDays, due_at]
      [1, 1, 0, due(-1)], // stage1 + DUE
      [2, 1, 1, due(48)], // stage1
      [3, 1, 3, due(120)], // stage2
      [4, 2, 7, due(240)], // stage3
      [5, 2, 20, due(720)], // stage4
      [6, 3, 250, due(4_800)], // stage7
      [7, 3, 250, due(4_800)],
      [8, 3, 250, due(4_800)],
      [9, 3, 250, due(4_800)],
      [10, 3, 250, due(4_800)],
      [11, 0, 1, due(24)], // stage0 (seeded, chưa planted)
      [12, 0, 1, due(24)],
      [13, 0, 1, due(24)],
    ];
    for (const [n, reps, iv, dueAt] of progressRows) {
      await tx`
        insert into user_word_progress (user_id, word_id, ease, interval_days, due_at, reps)
        select ${uid}, id, 2.5, ${iv}, ${dueAt}, ${reps}
        from words where word = ${wordName(n)}
        on conflict (user_id, word_id) do update set
          ease = 2.5, interval_days = ${iv}, due_at = ${dueAt}, reps = ${reps}
      `;
    }

    // planted hôm nay = 3 (learn-complete) — ring 3/5
    for (let n = 1; n <= 3; n++) {
      await tx`
        insert into vocab_activity
          (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key, created_at)
        select ${uid}, id, 'learn-complete', true, 4, 'qa-dash-seed', 0, 1,
               ${"qa-dash-seed:" + uid + ":" + n}, now()
        from words where word = ${wordName(n)}
        on conflict (idempotency_key) do nothing
      `;
    }

    // streak 2: presence hôm nay + hôm qua
    await tx`
      insert into daily_activity (user_id, date, vocab_steps)
      values
        (${uid}, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 3),
        (${uid}, ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 1), 1)
      on conflict (user_id, date) do update set vocab_steps = excluded.vocab_steps
    `;

    // XP + goal 5 (mặc định — test chỉnh 10 qua UI)
    await tx`
      update profiles set xp = 1248, daily_goal_words = 5, streak_count = 2
      where id = ${uid}
    `;

    // "đang đọc" level-5 — continue target ưu tiên sách đang đọc (nếu không,
    // fallback sách ĐẦU theo sortOrder = level-1 có 6 từ crawl trống → nhầm)
    await tx`
      insert into user_lesson_progress (user_id, lesson_id, done_parts)
      select ${uid}, l.id, 1
      from lessons l join units u on u.id = l.unit_id
      join books b on b.id = u.book_id
      where b.slug = ${DASH_BOOK_SLUG}
      order by l.id
      limit 1
      on conflict (user_id, lesson_id) do nothing
    `;
  });
}

/** Self-clean cuối run — xoá words QA (cascade book_words + progress + activity). */
export async function cleanupDashboardFixture(): Promise<void> {
  const c = client();
  const tables = await c`select to_regclass('words') as w`;
  if (!tables[0]?.w) return;
  await c`delete from words where word like 'qa-dash-%'`;
}

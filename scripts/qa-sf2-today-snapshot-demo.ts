/**
 * Integration demo SF-2 (VU-50) — getTodaySnapshot + getNextDictationTarget
 * trên DB local thật (ilec_sf2). Seed per-run user qa-sf2-demo, chạy snapshot
 * 2 LẦN (chứng minh quest/badge auto-record idempotent — lần 2 newly rỗng),
 * so số liệu tay ở log. KHÔNG dọn data (user QA giữ lại — cleanup qua
 * scripts/cleanup-test-data.ts).
 *
 * ⚠ @/db tạo postgres instance tại MODULE-INIT (drizzle(sql())) — script PHẢI
 * dynamic-import store SAU khi nạp .env.local (static import chạy trước body
 * → instance connection placeholder). Đây là lý do dùng await import().
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/qa-sf2-today-snapshot-demo.ts
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

const EMAIL = "qa-sf2-demo@ilec.test";

async function main() {
  const { getTodaySnapshot, getNextDictationTarget } = await import("@/lib/today/today-store");
  const { vnToday, addDays } = await import("@/lib/gamification/streak");
  const t = vnToday(new Date());
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  // ---- seed content: lesson 2 part (book level-1 unit 1 lesson 1) ----------
  const [book] = await sql`
    insert into books (id, slug, title_en, cefr_label, color, sort_order)
    values (901, 'qa-sf2-book', 'QA SF2 Book', 'A1', '#000000', 901)
    on conflict (id) do update set title_en = excluded.title_en
    returning id`;
  const [unit] = await sql`
    insert into units (book_id, number, title_en, sort_order)
    values (${book.id}, 1, 'U1', 1)
    on conflict (book_id, number) do update set title_en = excluded.title_en
    returning id`;
  const [lesson] = await sql`
    insert into lessons (unit_id, number, title_en, title_vi, kind, vocab_level, sort_order, published)
    values (${unit.id}, 1, 'QA Bài 1', 'Bài một', 'dictation', 'A1', 1, true)
    returning id`;

  const [partA] = await sql`
    insert into lesson_parts (lesson_id, sort_order, text, duration_ms)
    values (${lesson.id}, 1, 'hello world', 60000)
    returning id`;

  // ---- seed user + profile -------------------------------------------------
  const uid = randomUUID();
  await sql`
    insert into users (id, email, name, email_verified)
    values (${uid}, ${EMAIL}, 'QA SF2 Demo', now())`;
  await sql`
    insert into profiles (id, display_name, daily_goal_minutes, daily_goal_words, xp, streak_count, shield_credits)
    values (${uid}, 'QA SF2 Demo', 15, 5, 500, 3, 1)`;

  // ---- seed vocab practiced: 3 learn-complete (từ 1..3) + 2 session-step
  // correct (từ 4..5 — review, KHÔNG trùng learn) → practiced=5 planted=3
  // reviewed=2 ----------------------------------------------------------------
  const words: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const [w] = await sql`
      insert into words (word, meaning_vi)
      values (${"qa-sf2-demo-" + i}, ${"từ demo " + i})
      on conflict (word) do update set meaning_vi = excluded.meaning_vi
      returning id`;
    words.push(w.id);
  }
  for (const [i, wid] of words.entries()) {
    const kind = i < 3 ? "learn-complete" : "session-step";
    await sql`
      insert into vocab_activity (user_id, word_id, kind, correct, xp, session_key, step_index, attempt_no, idempotency_key, created_at)
      values (${uid}, ${wid}, ${kind}, true, 4, ${"qa-sf2-" + randomUUID()}, ${i}, 1, ${"qa-sf2-demo:" + uid + ":" + i}, now())`;
  }

  // ---- seed daily_activity: hôm nay listen 900000 (15'), parts 2; hôm qua;
  // HÔM KIA — nhưng HÔM QUA bỏ trống + freeze row → streak = hôm-nay + freeze
  // + hôm-kia = 3 -------------------------------------------------------------
  await sql`
    insert into daily_activity (user_id, date, listen_ms, parts_done, vocab_steps)
    values (${uid}, ${t}, 900000, 2, 5)`;
  await sql`
    insert into daily_activity (user_id, date, parts_done, vocab_steps)
    values (${uid}, ${addDays(t, -2)}, 0, 1)`;
  await sql`
    insert into streak_freezes (user_id, date) values (${uid}, ${addDays(t, -1)})`;

  // ---- seed dictation attempt: part A accuracy 1 → lesson done 1/1 part?
  // part A duy nhất + attempt pass → lesson DONE → dictationNext phải là BÀI
  // KHÁC — tạo lesson 2 (chưa attempt, 2 part) ngay sau ----------------------
  await sql`
    insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id)
    values (${uid}, ${partA.id}, 'hello world', 1, 40, 10, ${randomUUID()})`;
  const [lesson2] = await sql`
    insert into lessons (unit_id, number, title_en, title_vi, kind, vocab_level, sort_order, published)
    values (${unit.id}, 2, 'QA Bài 2', 'Bài hai', 'dictation', 'A1', 2, true)
    returning id`;
  await sql`
    insert into lesson_parts (lesson_id, sort_order, text, duration_ms)
    values (${lesson2.id}, 1, 'second lesson', 45000), (${lesson2.id}, 2, 'part two', 30000)`;

  // ---- seed quest ledger: 4 completions NGÀY TRƯỚC → nếu snapshot tự record
  // ≥1 quest hôm nay → questsCompleted 5 → badge quests-5 award NGAY LẦN 1 --
  for (let d = 1; d <= 4; d++) {
    await sql`
      insert into quest_completions (user_id, date, quest_id)
      values (${uid}, ${addDays(t, -d)}, ${"q-parts-3"})`;
  }

  // ---- chạy snapshot 2 LẦN --------------------------------------------------
  const s1 = await getTodaySnapshot(uid, new Date());
  console.log("== SNAPSHOT LẦN 1 ==");
  console.log(JSON.stringify(
    {
      date: s1.date,
      listenMinutesToday: s1.listenMinutesToday,
      dailyGoalMinutes: s1.dailyGoalMinutes,
      practicedToday: s1.practicedToday,
      plantedToday: s1.plantedToday,
      dailyGoalWords: s1.dailyGoalWords,
      partsToday: s1.partsToday,
      dueToday: s1.dueToday,
      reviewedToday: s1.reviewedToday,
      streak: s1.streak,
      activeToday: s1.activeToday,
      goalDone: { m: s1.goalDone.minutes.done, w: s1.goalDone.words.done, both: s1.goalDone.both },
      dictationNext: s1.dictationNext,
      vocabContinue: s1.vocabContinue && "slug" in s1.vocabContinue ? s1.vocabContinue.slug : null,
      quests: s1.quests,
      newlyCompletedQuests: s1.newlyCompletedQuests,
      newlyEarnedBadges: s1.newlyEarnedBadges,
      badges: s1.badges,
      shield: s1.shield,
    },
    null,
    2,
  ));

  console.log("\n== SNAPSHOT LẦN 2 (idempotency) ==");
  const s2 = await getTodaySnapshot(uid, new Date());
  console.log(JSON.stringify({
    newlyCompletedQuests_2: s2.newlyCompletedQuests,
    newlyEarnedBadges_2: s2.newlyEarnedBadges,
    questsRecorded_2: s2.quests.map((q) => q.recorded),
    badges_after: s2.badges,
    shield_credits_2: s2.shield.credits,
  }, null, 2));

  console.log("\n== getNextDictationTarget trực tiếp ==");
  console.log(JSON.stringify(await getNextDictationTarget(uid), null, 2));

  console.log("\n== SO TAY expectation ==");
  const expected = {
    practiced: 5, planted: 3, reviewed: 2, listenMinutes: 15, parts: 2,
    streak: 3, // hôm nay + freeze(hôm qua) + hôm kia
    due: 0,
  };
  const got = {
    practiced: s1.practicedToday, planted: s1.plantedToday, reviewed: s1.reviewedToday,
    listenMinutes: s1.listenMinutesToday, parts: s1.partsToday, streak: s1.streak, due: s1.dueToday,
  };
  const ok = JSON.stringify(expected) === JSON.stringify(got);
  console.log("expected:", expected, "\ngot:     ", got, "\nMATCH:", ok);
  process.exitCode = ok ? 0 : 1;

  // ---- cleanup seed QA (suite test:rls đếm books/words — không được ô nhiễm)-
  // attempts RESTRICT lesson_parts → xoá attempts user TRƯỚC book cascade
  await sql`delete from attempts where user_id = ${uid}`;
  await sql`delete from books where id = ${book.id}`; // cascade units/lessons/parts
  await sql`delete from users where id = ${uid}`; // cascade profiles + ledgers
  await sql`delete from words where word like ${"qa-sf2-demo-%"}`;
  await sql.end();
  console.log("\n== CLEANUP seed QA done (books/users/words qa-sf2-demo) ==");
}

main()
  .catch((e) => {
    console.error("DEMO FAIL:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(); // @/db pool giữ event loop — exit tường minh sau khi log
  });

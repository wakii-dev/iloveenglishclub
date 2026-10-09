/**
 * SF-2 acceptance walkthrough (VU-39) — Rule 0 proxy cho SF API-only:
 * login NextAuth credentials thật → GET/POST /api/vocabulary/session đi trọn
 * flow trên dev server (port 3327) + kiểm DB trực tiếp. Ghi evidence vào
 * docs/superpowers/evidence/sf-2-session-engine-api/walkthrough.txt —
 * FAIL bất kỳ mục → exit 1.
 *
 * Chạy: node scripts/qa-sf2-walkthrough.mjs (seed trước: node scripts/qa-sf2-seed.ts)
 */
import dotenv from "dotenv";
import fs from "node:fs";
import postgres from "postgres";

dotenv.config({ path: ".env.local" });
const BASE = "http://localhost:3327";
const BOOK_A = 9902;
const BOOK_B = 9903;
const EVIDENCE = "docs/superpowers/evidence/sf-2-session-engine-api/walkthrough.txt";

let cookie = "";
let pass = 0;
let fail = 0;
const log = [];

function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  log.push(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

async function login() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${BASE}/api/auth/csrf`);
      if (r.ok) break;
    } catch {
      /* server chưa lên — đợi */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const jar = r1.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const { csrfToken } = await r1.json();
  const body = new URLSearchParams({
    csrfToken,
    email: process.env.QA_SF2_EMAIL,
    password: process.env.QA_SF2_PASSWORD,
    redirect: "false",
    json: "true",
  });
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar },
    body,
    redirect: "manual",
  });
  cookie = r2.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const me = await api("GET", "/api/auth/session");
  check("login credentials + session cookie", me.json?.user?.id != null, `user=${me.json?.user?.email}`);
}

const noLeakKeys = (step) =>
  !("answer" in step) && !("correct" in step) && !("isCorrect" in step) && !("answerIndex" in step);

function assertChain(steps, wordIds, kindsPerWord, label) {
  // chuỗi per từ đúng thứ tự kindsPerWord; introduce positions theo batch 2
  let ok = true;
  const detail = [];
  for (const wid of wordIds) {
    const chain = steps.filter((s) => s.wordId === wid);
    const kinds = chain.map((s) => s.kind).join(",");
    if (kinds !== kindsPerWord) {
      ok = false;
      detail.push(`word ${wid}: "${kinds}" ≠ "${kindsPerWord}"`);
    }
  }
  check(`${label}: chuỗi per từ = ${kindsPerWord}`, ok, detail.join("; "));
}

async function main() {
  fs.mkdirSync("docs/superpowers/evidence/sf-2-session-engine-api", { recursive: true });
  log.push(`# SF-2 acceptance walkthrough — ${new Date().toISOString()}`);
  log.push(`# dev server ${BASE} · book A=${BOOK_A} (12 từ) · book B=${BOOK_B} (6 từ prod-shape)`);
  await login();

  // ── A1: GET learn lần đầu — sách chưa học → level 1, steps đúng chuỗi, no-leak
  const a1 = await api("GET", `/api/vocabulary/session?kind=learn&book=${BOOK_A}`);
  check("A1 GET learn 200", a1.status === 200 && a1.json?.ok === true);
  check("A1 sessionKey UUID", /^[0-9a-f-]{36}$/.test(a1.json?.sessionKey ?? ""));
  const stepsA1 = a1.json?.steps ?? [];
  const wordIds1 = [...new Set(stepsA1.map((s) => s.wordId))];
  check("A1 phiên 5 từ (level 1)", wordIds1.length === 5, `words=${wordIds1.join(",")}`);
  assertChain(stepsA1, wordIds1, "introduce,mc,listen,type", "A1");
  // đan xen: introduce theo batch 2 — positions 0,1 rồi sau chain batch trước
  const introPos = stepsA1.map((s, i) => (s.kind === "introduce" ? i : -1)).filter((i) => i >= 0);
  check("A1 đan xen batch 2 (intro pos 0,1,8,9,16)", JSON.stringify(introPos) === JSON.stringify([0, 1, 8, 9, 16]), `pos=${introPos}`);
  check(
    "A1 no-leak: không cờ đáp án; meaningVi chỉ type; word ẩn listen/type",
    stepsA1.every((s) => noLeakKeys(s)) &&
      stepsA1.every((s) => (s.kind === "type" || s.kind === "introduce" ? true : s.meaningVi === undefined)) &&
      stepsA1.every((s) => (s.kind === "listen" || s.kind === "type" ? s.word === undefined : true)) &&
      stepsA1.every((s) => s.kind !== "mc" || Array.isArray(s.options) && s.meaningVi === undefined),
  );
  const sk1 = a1.json.sessionKey;
  const wordMeta = new Map(); // wordId → {word, meaningVi, stepIdx per kind}
  for (const s of stepsA1) {
    const m = wordMeta.get(s.wordId) ?? {};
    if (s.word) m.word = s.word;
    if (s.meaningVi) m.meaningVi = s.meaningVi;
    m[s.kind] = s.stepIndex;
    wordMeta.set(s.wordId, m);
  }

  // ── A2: POST hết phiên 5 từ all-correct — reps đúng 1, XP §4, goalDone
  // XP §4 "lần-đầu-trong-ngày" PER (user, word): chỉ step ĐÚNG ĐẦU của từ được
  // 1 XP (mc — bước đầu chuỗi); listen/type sau đó 0; type + 4 learn-complete
  let totalXp = 0;
  let goalDone = false;
  for (const s of stepsA1) {
    if (s.kind === "introduce") continue; // card giới thiệu — không phải bước chấm (POST → 400 invalidStep đúng thiết kế)
    const meta = wordMeta.get(s.wordId);
    const response = s.kind === "type" ? meta.word : meta.meaningVi;
    const r = await api("POST", "/api/vocabulary/session", {
      sessionKey: sk1,
      kind: "learn",
      bookId: BOOK_A,
      wordId: s.wordId,
      stepIndex: s.stepIndex,
      attemptNo: 1,
      stepKind: s.kind,
      response,
    });
    const res = r.json;
    const okPost = r.status === 200 && res?.ok === true && res?.correct === true;
    if (!okPost) {
      check(`A2 POST ${s.kind}#${s.wordId}`, false, `status=${r.status} body=${JSON.stringify(res)?.slice(0, 120)}`);
      continue;
    }
    if (s.kind === "type") {
      const g = res.grade;
      check(
        `A2 type#${s.wordId}: q=4, reps tiến đúng 1, lapses 0`,
        g?.quality === 4 && g?.reps === 1 && g?.lapses === 0,
        `grade=${JSON.stringify(g)}`,
      );
      // type step-XP 0 (mc đã dùng lần-đầu-trong-ngày) + learn-complete 4
      check(`A2 type#${s.wordId}: xpAwarded = 4 (learn-complete; step-XP đã dùng ở mc)`, res.xpAwarded === 4, `xp=${res.xpAwarded}`);
      totalXp = res.totalXp;
      goalDone = res.goalDone;
    } else if (s.kind === "mc") {
      check(`A2 mc#${s.wordId}: grade null, +1 XP (đúng đầu trong ngày của từ)`, res.grade === null && res.xpAwarded === 1);
    } else {
      check(`A2 listen#${s.wordId}: grade null, 0 XP (lần-đầu đã dùng)`, res.grade === null && res.xpAwarded === 0, `xp=${res.xpAwarded}`);
    }
  }
  // 5 từ × (4 learn-complete + 1 step-đầu) = 25
  check("A2 tổng XP = 25 (5×5 theo §4 lần-đầu-trong-ngày)", totalXp === 25, `totalXp=${totalXp}`);
  check("A2 goalDone sau 5 từ (goal 5)", goalDone === true);
  const repsDb = await sql`select word_id, reps, lapses from user_word_progress where user_id = (select id from users where email = ${process.env.QA_SF2_EMAIL}) order by word_id`;
  check("A2 DB: 5 row progress reps=1 lapses=0", repsDb.length === 5 && repsDb.every((r) => r.reps === 1 && r.lapses === 0), JSON.stringify(repsDb));

  // ── A3: sai 1 bước → q=0 lapses+1; retry attemptNo 2 đúng → XP như thường
  const a3 = await api("GET", `/api/vocabulary/session?kind=learn&book=${BOOK_A}`);
  const stepsA3 = a3.json?.steps ?? [];
  const sk3 = a3.json.sessionKey;
  const w6 = stepsA3.find((s) => s.wordId === 6);
  const meta6 = {};
  for (const s of stepsA3.filter((x) => x.wordId === 6)) {
    if (s.word) meta6.word = s.word;
    if (s.meaningVi) meta6.meaning = s.meaningVi;
    meta6[s.kind] = s.stepIndex;
  }
  check("A3 phiên mới chứa từ 6 (chưa planted)", w6 != null, `words=${[...new Set(stepsA3.map((s) => s.wordId))].join(",")}`);
  const a3mc = await api("POST", "/api/vocabulary/session", {
    sessionKey: sk3, kind: "learn", bookId: BOOK_A, wordId: 6,
    stepIndex: meta6.mc, attemptNo: 1, stepKind: "mc", response: "sai hoàn toàn",
  });
  check("A3 mc sai: correct=false, xpAwarded=0", a3mc.json?.correct === false && a3mc.json?.xpAwarded === 0, `xp=${a3mc.json?.xpAwarded}`);
  const a3type = await api("POST", "/api/vocabulary/session", {
    sessionKey: sk3, kind: "learn", bookId: BOOK_A, wordId: 6,
    stepIndex: meta6.type, attemptNo: 1, stepKind: "type", response: meta6.word,
  });
  check(
    "A3 type đúng sau mc sai: q=0, reps=0, lapses=1, KHÔNG learn-complete (xp=1)",
    a3type.json?.grade?.quality === 0 && a3type.json?.grade?.reps === 0 && a3type.json?.grade?.lapses === 1 && a3type.json?.xpAwarded === 1,
    `grade=${JSON.stringify(a3type.json?.grade)} xp=${a3type.json?.xpAwarded}`,
  );
  const a3retryMc = await api("POST", "/api/vocabulary/session", {
    sessionKey: sk3, kind: "learn", bookId: BOOK_A, wordId: 6,
    stepIndex: meta6.mc, attemptNo: 2, stepKind: "mc", response: meta6.meaning,
  });
  // lần-đầu-trong-ngày của từ 6 đã dùng ở type attempt1 (correct=true) → 0 XP
  check("A3 retry mc (attempt 2) đúng: 0 XP (lần-đầu đã dùng — §4)", a3retryMc.json?.correct === true && a3retryMc.json?.xpAwarded === 0, `xp=${a3retryMc.json?.xpAwarded}`);
  const a3retry = await api("POST", "/api/vocabulary/session", {
    sessionKey: sk3, kind: "learn", bookId: BOOK_A, wordId: 6,
    stepIndex: meta6.type, attemptNo: 2, stepKind: "type", response: meta6.word,
  });
  check(
    "A3 retry type (attempt 2) đúng: q=4 reps=0→1, learn-complete +4 (lần đầu planting)",
    a3retry.json?.grade?.quality === 4 && a3retry.json?.grade?.reps === 1 && a3retry.json?.xpAwarded === 4,
    `grade=${JSON.stringify(a3retry.json?.grade)} xp=${a3retry.json?.xpAwarded}`,
  );
  const w6row = await sql`select reps, lapses from user_word_progress where user_id = (select id from users where email = ${process.env.QA_SF2_EMAIL}) and word_id = 6`;
  check("A3 DB từ 6: reps=1 lapses=1", w6row[0]?.reps === 1 && w6row[0]?.lapses === 1, JSON.stringify(w6row[0]));

  // ── A4: duplicate idempotency — cached, due/XP không đổi
  const beforeDup = await sql`select uwp.due_at, uwp.reps, p.xp from user_word_progress uwp join profiles p on p.id = uwp.user_id where uwp.user_id = (select id from users where email = ${process.env.QA_SF2_EMAIL}) and uwp.word_id = 6`;
  const dup = await api("POST", "/api/vocabulary/session", {
    sessionKey: sk3, kind: "learn", bookId: BOOK_A, wordId: 6,
    stepIndex: meta6.type, attemptNo: 2, stepKind: "type", response: meta6.word,
  });
  const afterDup = await sql`select uwp.due_at, uwp.reps, p.xp from user_word_progress uwp join profiles p on p.id = uwp.user_id where uwp.user_id = (select id from users where email = ${process.env.QA_SF2_EMAIL}) and uwp.word_id = 6`;
  check(
    "A4 duplicate POST: cached (xpAwarded mirror row xp=0 — step-XP lần-đầu đã dùng), due_at + XP DB KHÔNG đổi",
    dup.json?.correct === true &&
      dup.json?.xpAwarded === 0 &&
      JSON.stringify(beforeDup[0]) === JSON.stringify(afterDup[0]),
    `xp=${dup.json?.xpAwarded} before=${JSON.stringify(beforeDup[0])} after=${JSON.stringify(afterDup[0])}`,
  );

  // ── A5: GET lại sau "reload" — planted biến mất; queue KHÔNG tràn level 2
  // 12 từ: level 1 = từ 1-10, planted 1-6 → level 1 còn 4 reps=0 (7,8,9,10);
  // từ 11-12 thuộc level 2 — level 1 chưa xong nên KHÔNG nhảy level
  const a5 = await api("GET", `/api/vocabulary/session?kind=learn&book=${BOOK_A}`);
  const ids5 = [...new Set((a5.json?.steps ?? []).map((s) => s.wordId))];
  check(
    "A5 reload: từ 6 biến mất; queue = 4 từ còn reps=0 TRONG level 1 (không tràn level 2)",
    JSON.stringify(ids5) === JSON.stringify([7, 8, 9, 10]),
    `words=${ids5.join(",")}`,
  );

  // ── A6: book 6 từ prod-shape — MC 3 lựa chọn, từ không audio bỏ listen, không crash
  const a6 = await api("GET", `/api/vocabulary/session?kind=learn&book=${BOOK_B}`);
  const stepsB = a6.json?.steps ?? [];
  const idsB = [...new Set(stepsB.map((s) => s.wordId))];
  const bRow = await sql`select id from words where word = 'qa-sf2-b-05'`;
  const b5 = bRow[0]?.id;
  const chainB5 = stepsB.filter((s) => s.wordId === b5).map((s) => s.kind).join(",");
  const mcSteps = stepsB.filter((s) => s.kind === "mc");
  check(
    "A6 book 6 từ: MC 3 lựa chọn (pool 3 nghĩa), từ b-05 không audio bỏ listen, không crash",
    a6.json?.ok === true && idsB.length === 5 && mcSteps.every((s) => s.options?.length === 3) && chainB5 === "introduce,mc,type",
    `mc options=[${mcSteps[0]?.options?.length}] b5 chain="${chainB5}"`,
  );

  // ── A7: review flow — 2 từ planted set due quá khứ → GET → sai 1 đúng 1
  await sql`update user_word_progress set due_at = now() - interval '2 hours' where user_id = (select id from users where email = ${process.env.QA_SF2_EMAIL}) and word_id in (1, 2)`;
  const a7 = await api("GET", `/api/vocabulary/session?kind=review&book=${BOOK_A}`);
  const stepsR = a7.json?.steps ?? [];
  const idsR = [...new Set(stepsR.map((s) => s.wordId))];
  check("A7 review: đúng 2 từ due (SQL-side oldest-first)", a7.json?.ok === true && idsR.length === 2, `words=${idsR.join(",")}`);
  assertChain(stepsR, idsR, "listen,type", "A7");
  const metaR = new Map();
  for (const s of stepsR) {
    const m = metaR.get(s.wordId) ?? {};
    if (s.meaningVi) m.meaning = s.meaningVi;
    m[s.kind] = s.stepIndex;
    metaR.set(s.wordId, m);
  }
  const [wWrong, wRight] = idsR;
  // word text KHÔNG có trong review payload (no-leak — type chỉ prompt) —
  // walkthrough lấy từ DB (data của chính fixture)
  const wordTexts = await sql`select id, word from words where id in (${wWrong}, ${wRight})`;
  const textOf = (id) => wordTexts.find((w) => w.id === id)?.word;
  const r1s = await api("POST", "/api/vocabulary/session", {
    sessionKey: a7.json.sessionKey, kind: "review", bookId: BOOK_A, wordId: wWrong,
    stepIndex: metaR.get(wWrong).listen, attemptNo: 1, stepKind: "listen", response: metaR.get(wWrong).meaning,
  });
  // từ 1 đã correct-today từ phiên learn (A2) → lần-đầu-trong-ngày đã dùng → 0 XP
  check("A7 listen từ 1 đúng: correct, 0 XP (lần-đầu đã dùng — §4)", r1s.json?.correct === true && r1s.json?.xpAwarded === 0, `xp=${r1s.json?.xpAwarded}`);
  const r1t = await api("POST", "/api/vocabulary/session", {
    sessionKey: a7.json.sessionKey, kind: "review", bookId: BOOK_A, wordId: wWrong,
    stepIndex: metaR.get(wWrong).type, attemptNo: 1, stepKind: "type", response: "sai-từ",
  });
  check(
    "A7 type SAI từ 1: q=0, reps 1→0, lapses 1, 0 XP",
    r1t.json?.correct === false && r1t.json?.grade?.quality === 0 && r1t.json?.grade?.reps === 0 && r1t.json?.grade?.lapses === 1 && r1t.json?.xpAwarded === 0,
    `grade=${JSON.stringify(r1t.json?.grade)}`,
  );
  const r2s = await api("POST", "/api/vocabulary/session", {
    sessionKey: a7.json.sessionKey, kind: "review", bookId: BOOK_A, wordId: wRight,
    stepIndex: metaR.get(wRight).listen, attemptNo: 1, stepKind: "listen", response: metaR.get(wRight).meaning,
  });
  check("A7 listen từ 2 đúng: correct (0 XP — lần-đầu đã dùng ở A2)", r2s.json?.correct === true);
  const r2t = await api("POST", "/api/vocabulary/session", {
    sessionKey: a7.json.sessionKey, kind: "review", bookId: BOOK_A, wordId: wRight,
    stepIndex: metaR.get(wRight).type, attemptNo: 1, stepKind: "type", response: textOf(wRight),
  });
  check(
    "A7 từ 2 đúng cả 2 bước: q=4, reps 1→2, interval 6 (SM-2 tiến đúng)",
    r2t.json?.grade?.quality === 4 && r2t.json?.grade?.reps === 2 && r2t.json?.grade?.intervalDays === 6 && r2t.json?.grade?.lapses === 0,
    `grade=${JSON.stringify(r2t.json?.grade)} listen xp=${r2s.json?.xpAwarded} (lần-đầu đã dùng ở A2 — §4)`,
  );
  const a7again = await api("GET", `/api/vocabulary/session?kind=review&book=${BOOK_A}`);
  check(
    "A7 review lại: queue rỗng (q=0 due +1d + q=4 due +6d đều rời hôm nay)",
    a7again.json?.ok === true && (a7again.json?.steps ?? []).length === 0,
    `steps=${(a7again.json?.steps ?? []).length}`,
  );
  // prefill ?word=
  const a7prefill = await api("GET", `/api/vocabulary/session?kind=review&word=${wRight}`);
  check(
    "A7 prefill ?word= → queue đúng 1 từ (KHÔNG đòi due)",
    a7prefill.json?.ok === true && [...new Set((a7prefill.json?.steps ?? []).map((s) => s.wordId))].length === 1,
  );
  // lỗi taxonomy nhanh trên server thật
  const e401 = await fetch(`${BASE}/api/vocabulary/session?kind=learn&book=${BOOK_A}`);
  check("taxonomy 401 không cookie", e401.status === 401);
  const e400 = await api("GET", "/api/vocabulary/session?kind=quiz");
  check("taxonomy 400 invalidKind", e400.status === 400 && e400.json?.error === "invalidKind");
  const e404 = await api("GET", "/api/vocabulary/session?kind=review&word=999999");
  check("taxonomy 404 wordNotFound (prefill không có progress)", e404.status === 404 && e404.json?.error === "wordNotFound");

  await sql.end();
  log.push(`# Kết quả: ${pass} PASS / ${fail} FAIL`);
  fs.writeFileSync(EVIDENCE, log.join("\n") + "\n");
  console.log(`\n${pass} PASS / ${fail} FAIL → ${EVIDENCE}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error("walkthrough CRASHED:", error);
  log.push(`CRASHED: ${error.message}`);
  fs.writeFileSync(EVIDENCE, log.join("\n") + "\n", { flag: "a" });
  await sql.end().catch(() => {});
  process.exit(1);
});

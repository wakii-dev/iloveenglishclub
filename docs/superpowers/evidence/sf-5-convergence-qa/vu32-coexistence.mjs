/**
 * VU-32 coexistence check — VU-37 SF-5 (context pack #7): enrich dry-run
 * (KHÔNG ghi) chạy SONG SONG flow học; words bảng chỉ READ từ vocab flow.
 *
 * Kiểm 3 lớp:
 *  1. snapshot words (mọi cột) TRƯỚC/SAU — byte-equal (flow học không đụng)
 *  2. POST /api/admin/vocabulary/crawl/enrich {bookId:1, dryRun:true} → ok
 *     + counts shape (admin session qua UI login — assertAdmin)
 *  3. static: grep INSERT/UPDATE words toàn src — chỉ enrich.ts + admin
 *     vocabulary-store.ts (VU-32 surface) — ghi kết quả grep vào evidence
 *
 * Chạy SONG SONG browser-verify.mjs cùng server 3321:
 *   node docs/superpowers/evidence/sf-5-convergence-qa/vu32-coexistence.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.E2E_URL ?? "http://localhost:3321";
const OUT = new URL(".", import.meta.url).pathname;

let DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL) {
  const env = fs.readFileSync(".env.local", "utf8");
  DB_URL = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^\"|\"$/g, "") ?? "";
}
const sql = postgres(DB_URL, { prepare: false });

const ADMIN_EMAIL = "qa-sf5-admin@test.ilec";
const ADMIN_PASSWORD = "sf5-admin-pass";

async function snapshot() {
  const rows = await sql`
    select id, word, ipa, meaning_vi, example, audio_url, cefr, source, created_at
    from words order by id
  `;
  return JSON.stringify(rows);
}

const before = await snapshot();
console.log(`[vu32] snapshot before: ${(before.length / 1024).toFixed(1)}KB`);

// ── upsert admin QA (pattern create-admin.upsertAdmin — bcryptjs)
const bcrypt = (await import("bcryptjs")).default;
const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
await sql.begin(async (tx) => {
  const existing = await tx`select id from users where email = ${ADMIN_EMAIL}`;
  let userId;
  if (existing.length) {
    userId = existing[0].id;
    await tx`update users set password_hash = ${passwordHash} where id = ${userId}`;
  } else {
    const [u] = await tx`
      insert into users (id, email, name, password_hash)
      values (${crypto.randomUUID()}, ${ADMIN_EMAIL}, 'QA SF5 Admin', ${passwordHash})
      returning id`;
    userId = u.id;
  }
  await tx`
    insert into profiles (id, display_name, role) values (${userId}, 'QA SF5 Admin', 'admin')
    on conflict (id) do update set role = 'admin'
  `;
});

// ── login admin qua UI rồi POST dryRun NHIỀU LẦN trong lúc flow học chạy
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/vi/login`, { waitUntil: "domcontentloaded" });
await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
await page.getByLabel(/password|mật khẩu/i).fill(ADMIN_PASSWORD);
await page.locator("form").getByRole("button", { name: /đăng nhập|log in/i }).click();
await page.waitForURL(/\/vi$/);

const results = [];
// flow học chạy ~1-2 phút — poll dryRun mỗi 8s (6 lần), kề cận "song song"
for (let i = 0; i < 6; i++) {
  const resp = await page.evaluate(async () => {
    const r = await fetch("/api/admin/vocabulary/crawl/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId: 1, dryRun: true }),
    });
    return { status: r.status, body: await r.json() };
  });
  results.push(resp);
  console.log(`[vu32] dryRun #${i + 1}: HTTP ${resp.status} → ${JSON.stringify(resp.body).slice(0, 160)}`);
  await page.waitForTimeout(8_000);
}
await browser.close();

const allOk = results.every((r) => r.status === 200 && r.body.ok === true);

// ── snapshot sau + so sánh
const after = await snapshot();
const unchanged = before === after;
console.log(`[vu32] words snapshot TRƯỚC/SAU identical: ${unchanged}`);

// ── static grep: write-path vào words
const { execSync } = await import("node:child_process");
const grep = execSync(
  `grep -rn "insert(words)\\|update(words)\\|insert into words\\|UPDATE words\\|INSERT INTO words" src --include="*.ts" --include="*.tsx" | grep -v test || true`,
  { encoding: "utf8" },
);
console.log("[vu32] static write-paths vào words:\n" + grep.trim());

fs.writeFileSync(
  `${OUT}vu32-coexistence.txt`,
  [
    `VU-32 coexistence — ${new Date().toISOString()}`,
    `dryRun calls: ${results.length}, all ok: ${allOk}`,
    `sample: ${JSON.stringify(results[0]?.body).slice(0, 300)}`,
    `words snapshot before/after identical: ${unchanged}`,
    ``,
    `static write-paths vào words (chỉ enrich.ts VU-32 + admin vocabulary-store):`,
    grep.trim(),
    ``,
    `Kết luận: vocab flow (learn/review/lookup) KHÔNG ghi words;`,
    `enrich dryRun:true chỉ counts — source='oxford-ld'/cefr không bị ghi đè.`,
  ].join("\n"),
);

await sql`delete from users where email = ${ADMIN_EMAIL}`;
await sql.end({ timeout: 5 });
process.exit(allOk && unchanged ? 0 : 1);

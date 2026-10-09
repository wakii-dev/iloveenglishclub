/**
 * Fixture QA cho SF-2 acceptance walkthrough (vocab-memrise, VU-39) —
 * context pack #10: fixture owner tái dùng pattern `e2e/vocabulary-learn-fixture.ts`
 * + `scripts/create-admin.ts`; KHÔNG đụng book/word thật.
 *
 * Tạo (idempotent — re-run sạch):
 * - QA user `qa-sf2@test.local` (role user; password QA_SF2_PASSWORD trong
 *   .env.local — script tự generate+append khi thiếu, không print)
 * - Book `qa-sf2-book` id 9902: 12 từ `qa-sf2-a-*` nghĩa PHÂN BIỆT + audio
 *   (2 level × 6... 12 từ = level 1 + level 2 theo chunk 10/2) — learn flow
 *   chính: phiên 5 từ, level advance
 * - Book `qa-sf2-book6` id 9903: 6 từ prod-shape — 3 nghĩa phân biệt (MC 3
 *   lựa chọn) + 1 từ KHÔNG audio (listen-step bị bỏ) — degenerate pool
 *
 * Chạy: node scripts/qa-sf2-seed.ts
 * Teardown: `node scripts/cleanup-test-data.ts` (xoá theo prefix qa-sf2-) hoặc
 * xoá 2 book id 9902/9903 + user qa-sf2@test.local.
 */
import bcrypt from "bcryptjs";
import { asc, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

dotenv.config({ path: ".env.local" });

type Schema = typeof import("../src/db/schema.ts");

export const QA_EMAIL = "qa-sf2@test.local";
export const QA_BOOK_A_ID = 9902;
export const QA_BOOK_B_ID = 9903;
export const QA_BOOK_A_SLUG = "qa-sf2-book";
export const QA_BOOK_B_SLUG = "qa-sf2-book6";

const BOOK_A_WORDS = Array.from({ length: 12 }, (_, i) => ({
  word: `qa-sf2-a-${String(i + 1).padStart(2, "0")}`,
  meaning: `nghĩa QA A${i + 1}`,
  audio: `https://cdn.example.com/audio/qa-sf2-a-${String(i + 1).padStart(2, "0")}.mp3`,
}));

// 3 nghĩa phân biệt × 2 từ — MC giảm còn 3 lựa chọn; b-05 không audio
const BOOK_B_WORDS = [
  { word: "qa-sf2-b-01", meaning: "nghĩa QA B1", audio: "https://cdn.example.com/audio/qa-sf2-b-01.mp3" },
  { word: "qa-sf2-b-02", meaning: "nghĩa QA B2", audio: "https://cdn.example.com/audio/qa-sf2-b-02.mp3" },
  { word: "qa-sf2-b-03", meaning: "nghĩa QA B3", audio: "https://cdn.example.com/audio/qa-sf2-b-03.mp3" },
  { word: "qa-sf2-b-04", meaning: "nghĩa QA B1", audio: "https://cdn.example.com/audio/qa-sf2-b-04.mp3" },
  { word: "qa-sf2-b-05", meaning: "nghĩa QA B2", audio: null },
  { word: "qa-sf2-b-06", meaning: "nghĩa QA B3", audio: "https://cdn.example.com/audio/qa-sf2-b-06.mp3" },
];

/** Đảm bảo QA_SF2_PASSWORD có trong .env.local (generate khi thiếu — không print). */
function ensurePasswordEnv(): string {
  const envPath = ".env.local";
  let env = fs.readFileSync(envPath, "utf8");
  const line = env
    .split("\n")
    .find((l) => l.startsWith("QA_SF2_PASSWORD="));
  if (line) return line.slice("QA_SF2_PASSWORD=".length).trim();
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(20);
  const password = Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
  env += `\nQA_SF2_EMAIL=${QA_EMAIL}\nQA_SF2_PASSWORD=${password}\n`;
  fs.writeFileSync(envPath, env);
  return password;
}

export async function ensureQaSf2Fixture(): Promise<{
  userId: string;
  password: string;
}> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL thiếu — set trong .env.local");
  }
  const password = ensurePasswordEnv();
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle(sql);
  const s = (await import("../src/db/schema.ts")) as Schema;
  try {
    // User QA (role user — route chỉ cần session)
    const passwordHash = await bcrypt.hash(password, 10);
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, QA_EMAIL))
      .limit(1);
    let userId: string;
    if (existing) {
      userId = existing.id;
      await db
        .update(s.users)
        .set({ passwordHash })
        .where(eq(s.users.id, userId));
      await db
        .update(s.profiles)
        .set({ xp: 0, streakCount: 0, dailyGoalWords: 5, lastActiveDate: null })
        .where(eq(s.profiles.id, userId));
    } else {
      const [created] = await db
        .insert(s.users)
        .values({ email: QA_EMAIL, name: "QA SF-2", passwordHash })
        .returning({ id: s.users.id });
      userId = created!.id;
      await db
        .insert(s.profiles)
        .values({ id: userId, displayName: "QA SF-2", role: "user" });
    }

    // Progress/activity cũ của lần chạy trước — reset sạch cho walkthrough
    await db.delete(s.userWordProgress).where(eq(s.userWordProgress.userId, userId));
    await db.delete(s.vocabActivity).where(eq(s.vocabActivity.userId, userId));

    // 2 book QA + words (idempotent)
    for (const book of [
      { id: QA_BOOK_A_ID, slug: QA_BOOK_A_SLUG, title: "QA SF-2 Book A" },
      { id: QA_BOOK_B_ID, slug: QA_BOOK_B_SLUG, title: "QA SF-2 Book B (6 từ)" },
    ]) {
      await db
        .insert(s.books)
        .values({
          id: book.id,
          slug: book.slug,
          titleEn: book.title,
          cefrLabel: "A1",
          color: "#2563eb",
          sortOrder: 9990 + book.id - 9902,
        })
        .onConflictDoNothing();
    }
    await db
      .insert(s.words)
      .values(
        BOOK_A_WORDS.map((w) => ({
          word: w.word,
          meaningVi: w.meaning,
          audioUrl: w.audio,
        })),
      )
      .onConflictDoNothing();
    await db
      .insert(s.words)
      .values(
        BOOK_B_WORDS.map((w) => ({
          word: w.word,
          meaningVi: w.meaning,
          audioUrl: w.audio,
        })),
      )
      .onConflictDoNothing();

    // book_words: xoá gán cũ rồi gán lại theo đúng order — đọc lại theo PREFIX
    // (idempotent qua lần chạy trước, không phụ thuộc returning của conflict)
    await db.delete(s.bookWords).where(eq(s.bookWords.bookId, QA_BOOK_A_ID));
    await db.delete(s.bookWords).where(eq(s.bookWords.bookId, QA_BOOK_B_ID));
    const allA = await db
      .select({ id: s.words.id, word: s.words.word })
      .from(s.words)
      .where(like(s.words.word, "qa-sf2-a-%"))
      .orderBy(asc(s.words.word));
    const allB = await db
      .select({ id: s.words.id, word: s.words.word })
      .from(s.words)
      .where(like(s.words.word, "qa-sf2-b-%"))
      .orderBy(asc(s.words.word));
    await db.insert(s.bookWords).values(
      allA.map((w, i) => ({ bookId: QA_BOOK_A_ID, wordId: w.id, order: i + 1 })),
    );
    await db.insert(s.bookWords).values(
      allB.map((w, i) => ({ bookId: QA_BOOK_B_ID, wordId: w.id, order: i + 1 })),
    );

    return { userId, password };
  } finally {
    await sql.end();
  }
}

const isMain = process.argv[1]?.endsWith("qa-sf2-seed.ts");
if (isMain) {
  ensureQaSf2Fixture()
    .then(({ userId }) => {
      console.log("qa-sf2 fixture OK — userId", userId);
      process.exit(0);
    })
    .catch((error) => {
      console.error("qa-sf2 seed FAILED:", error.message);
      process.exit(1);
    });
}

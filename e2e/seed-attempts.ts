/**
 * E2E fixture DB (SF-5 — ACCEPTANCE #5): 1 learner (non-admin) + 1 attempt
 * trên part 1 của lesson demo L3-U1-L1 (published, có audio từ seed) — để
 * case "part có attempts → nút xóa disabled + tooltip RESTRICT" có data thật.
 * Idempotent (onConflictDoNothing). Gọi từ global-setup; chạy trực tiếp được:
 *   node e2e/seed-attempts.ts
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";

type Schema = typeof import("../src/db/schema.ts");

export const LEARNER_EMAIL = "e2e-learner@example.com";

export async function ensureAttemptFixture(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL thiếu — set trong .env.local");
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle(sql);
  const s = (await import("../src/db/schema.ts")) as Schema;
  try {
    // lesson demo L3-U1-L1 → part sortOrder 1
    const [part] = await db
      .select({ id: s.lessonParts.id, text: s.lessonParts.text })
      .from(s.lessonParts)
      .innerJoin(s.lessons, eq(s.lessonParts.lessonId, s.lessons.id))
      .innerJoin(s.units, eq(s.lessons.unitId, s.units.id))
      .innerJoin(s.books, eq(s.units.bookId, s.books.id))
      .where(
        and(
          eq(s.books.slug, "level-3"),
          eq(s.units.number, 1),
          eq(s.lessons.number, 1),
          eq(s.lessonParts.sortOrder, 1),
        ),
      )
      .limit(1);
    if (!part) throw new Error("lesson demo L3-U1-L1 part 1 không tồn tại — chạy db:seed trước");

    // learner user + profile (non-admin)
    const passwordHash = await bcrypt.hash("e2e-learner-pass", 10);
    let [user] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, LEARNER_EMAIL))
      .limit(1);
    if (!user) {
      [user] = await db
        .insert(s.users)
        .values({
          email: LEARNER_EMAIL,
          name: "E2E Learner",
          passwordHash,
        })
        .returning({ id: s.users.id });
    }
    await db
      .insert(s.profiles)
      .values({ id: user!.id, displayName: "E2E Learner", role: "user" })
      .onConflictDoNothing();

    // attempt trên part demo
    await db
      .insert(s.attempts)
      .values({
        userId: user!.id,
        partId: part.id,
        typedText: part.text,
        accuracy: 1,
        wpm: 20,
        xp: 10,
        clientAttemptId: "00000000-0000-4000-8000-000000000001",
      })
      .onConflictDoNothing();
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isDirectRun = process.argv[1]?.endsWith("seed-attempts.ts");
if (isDirectRun) {
  ensureAttemptFixture()
    .then(() => console.log("attempt fixture OK"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

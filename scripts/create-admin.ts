/**
 * Tạo/nâng cấp tài khoản ADMIN (SF-5) — cho dev browser + E2E globalSetup.
 * KHÔNG đụng seed.ts (SF-2). Idempotent: user tồn tại → update password +
 * profiles.role='admin'.
 *
 * Chạy: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
 * (password ≥ 8 ký tự — cùng rule registerAction)
 *
 * Node type-strip: import relative CÓ extension; schema import ĐỘNG sau khi
 * nạp .env.local (ESM static import sẽ hoist trước dotenv.config) — cùng
 * pattern seed.ts.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";

type Schema = typeof import("../src/db/schema.ts");

let db: ReturnType<typeof drizzle>;
let s: Schema;

export async function upsertAdmin(
  email: string,
  password: string,
  name: string,
): Promise<string> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL thiếu — set trong .env.local");
  }
  const sql = postgres(process.env.DATABASE_URL, { prepare: false });
  db = drizzle(sql);
  s = await import("../src/db/schema.ts");
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const [existing] = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, email))
      .limit(1);
    let userId: string;
    if (existing) {
      userId = existing.id;
      await db
        .update(s.users)
        .set({ passwordHash, name })
        .where(eq(s.users.id, userId));
    } else {
      const [created] = await db
        .insert(s.users)
        .values({ email, name, passwordHash })
        .returning({ id: s.users.id });
      userId = created!.id;
    }
    await db
      .insert(s.profiles)
      .values({ id: userId, displayName: name, role: "admin" })
      .onConflictDoUpdate({
        target: s.profiles.id,
        set: { role: "admin", displayName: name },
      });
    return userId;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: ".env.local" });
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME ?? "Admin";
  if (!email || password.length < 8) {
    console.error(
      "ADMIN_EMAIL/ADMIN_PASSWORD thiếu (password ≥ 8 ký tự) — set env hoặc .env.local",
    );
    process.exit(1);
  }
  const userId = await upsertAdmin(email, password, name);
  console.log(`admin OK: ${email} (user ${userId})`);
}

const isDirectRun = process.argv[1]?.endsWith("create-admin.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

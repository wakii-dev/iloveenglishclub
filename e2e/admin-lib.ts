import bcrypt from "bcryptjs";
import postgres from "postgres";
import dotenv from "dotenv";
import { encode } from "next-auth/jwt";
import { expect, type Page } from "@playwright/test";

/**
 * Helpers dùng chung specs admin-* (SF-4 QA hardening VU-28) — RE-RUNNABLE
 * trên DB BẤT KỲ (context pack P1-4): mọi fixture unique-per-run + self-clean.
 *
 * - Content prefix `[QA-SF4]`, unit number 900+ (baseline dùng 90–139 — không va).
 * - Account test `sf4-…@test.ilec`; fixture learner `e2e-learner@example.com`
 *   (globalSetup) là READ-ONLY — KHÔNG mutate role nó (gating spec guard).
 * - FK order dọn dẹp: attempts RESTRICT lesson_parts → xóa attempts trước,
 *   users xóa cuối (cascade profiles/attempts/progress — schema).
 * - Forged-JWT (probe gating): encode() từ next-auth/jwt — CÙNG lib middleware
 *   dùng (JWE `dir`, secret AUTH_SECRET, salt = tên cookie session). Claims
 *   theo jwt callback src/auth.ts: `id` (→ session.user.id) + `role`.
 */

dotenv.config({ path: ".env.local" });

export const QA_UNIT_MIN = 900;
export const QA_PREFIX = "[QA-SF4]";
export const QA_USER_PASSWORD = "sf4-user-pass";

/** Unit number unique-per-run 900–989 — re-run không va leftover. */
export function qaUnitNumber(): number {
  return QA_UNIT_MIN + (Date.now() % 90);
}

let sql: postgres.Sql | null = null;

function db(): postgres.Sql {
  sql ??= postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  return sql;
}

/** user id theo email (read-only — dùng cho forged-JWT probe). */
export async function userIdOf(email: string): Promise<string | null> {
  const rows = await db()`select id from users where email = ${email} limit 1`;
  return rows[0]?.id ?? null;
}

/** role hiện tại của user (read-only — guard contamination). */
export async function roleOf(email: string): Promise<string | null> {
  const rows = await db()`
    select p.role from profiles p join users u on u.id = p.id
    where u.email = ${email} limit 1`;
  return rows[0]?.role ?? null;
}

/** Tạo/nâng user test `sf4-*@test.ilec` role `user` (idempotent).
 *  users.id KHÔNG auto-generate (Auth.js adapter sinh khi insert) — supply UUID. */
export async function seedQaUser(
  email: string,
  name: string,
): Promise<string> {
  const passwordHash = await bcrypt.hash(QA_USER_PASSWORD, 10);
  const [existing] = await db()`select id from users where email = ${email} limit 1`;
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db()`update users set name = ${name}, password_hash = ${passwordHash} where id = ${id}`;
  } else {
    await db()`insert into users (id, email, name, password_hash) values (${id}, ${email}, ${name}, ${passwordHash})`;
  }
  await db()`
    insert into profiles (id, display_name, role)
    values (${id}, ${name}, 'user')
    on conflict (id) do update set role = 'user'`;
  return id;
}

/** Xóa account test (users cascade profiles + attempts + progress — schema). */
export async function cleanupQaAccount(email: string): Promise<void> {
  await db()`delete from users where email = ${email}`;
}

/**
 * Self-clean unit [QA-SF4] theo số unit: attempts trước (RESTRICT parts),
 * units sau (cascade lessons → parts; user_lesson_progress cascade theo lessons).
 */
export async function cleanupQaUnit(unitNumber: number): Promise<void> {
  await db()`
    delete from attempts where part_id in (
      select p.id from lesson_parts p
      join lessons l on l.id = p.lesson_id
      join units un on un.id = l.unit_id
      where un.number = ${unitNumber} and un.number >= ${QA_UNIT_MIN}
    )`;
  await db()`delete from units where number = ${unitNumber} and number >= ${QA_UNIT_MIN}`;
}

/**
 * Seed 1 attempt trên part ĐẦU TIÊN của unit [QA-SF4] (RESTRICT delete test) —
 * attempts RESTRICT lesson_parts nên phải xóa tay trong cleanupQaUnit.
 */
export async function seedAttemptOnUnitPart(
  unitNumber: number,
  userId: string,
): Promise<void> {
  const [part] = await db()`
    select p.id, p.text from lesson_parts p
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    where un.number = ${unitNumber} and un.number >= ${QA_UNIT_MIN}
    order by p.sort_order limit 1`;
  if (!part) throw new Error(`unit ${unitNumber} chưa có part — thêm part trước khi seed attempt`);
  await db()`
    insert into attempts (user_id, part_id, typed_text, accuracy, wpm, xp, client_attempt_id)
    values (${userId}, ${part.id}, ${part.text}, 1, 20, 10, ${crypto.randomUUID()})
    on conflict do nothing`;
}

/**
 * lesson ID (PK) theo số unit + số lesson — editor URL dùng NUMBER-based routing
 * ([lesson] = number) NHƯNG upload API expects DB id: bắn number vào lessonId
 * sẽ trúng lesson khác có id trùng (sự cố 2026-09-30: audio demo bị ghi đè).
 * Luôn resolve qua SQL + guard response path chứa unit-N.
 */
export async function lessonIdByNumber(
  unitNumber: number,
  lessonNumber: number,
): Promise<number> {
  const [row] = await db()`
    select l.id from lessons l
    join units un on un.id = l.unit_id
    where un.number = ${unitNumber} and un.number >= ${QA_UNIT_MIN} and l.number = ${lessonNumber}
    limit 1`;
  if (!row) throw new Error(`lesson ${lessonNumber} trong unit ${unitNumber} không tồn tại`);
  return row.id;
}

/**
 * Part row theo (unit number, lesson number, sort order) — verify audio_path/
 * duration_ms sau upload (failsoft check). Read-only.
 */
export async function partOf(
  unitNumber: number,
  lessonNumber: number,
  sortOrder: number,
): Promise<{ audioPath: string | null; durationMs: number | null } | null> {
  const [row] = await db()<[
    { audioPath: string | null; durationMs: number | null },
  ]>`
    select p.audio_path as "audioPath", p.duration_ms as "durationMs"
    from lesson_parts p
    join lessons l on l.id = p.lesson_id
    join units un on un.id = l.unit_id
    where un.number = ${unitNumber} and un.number >= ${QA_UNIT_MIN}
      and l.number = ${lessonNumber} and p.sort_order = ${sortOrder}
    limit 1`;
  return row ?? null;
}

/** Forge session cookie value hợp lệ chữ ký (middleware chấp nhận) với claims tùy ý. */
export async function forgeSessionToken(claims: {
  sub: string;
  role: string;
  email?: string;
  name?: string;
}): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET thiếu trong .env.local — probe forged-JWT không chạy được");
  return encode({
    token: {
      sub: claims.sub,
      id: claims.sub,
      role: claims.role,
      email: claims.email,
      name: claims.name,
      locale: "vi",
    },
    secret,
    salt: "authjs.session-token",
  });
}

/** Đăng nhập UI qua /vi/login (selector tiếng Việt) — full load sau đó nên session tươi. */
export async function loginAs(
  page: Page,
  email: string,
  password: string,
  next = "/admin",
): Promise<void> {
  await page.goto(`/vi/login?next=${encodeURIComponent(next)}`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  // Chờ rời trang login (redirect theo next hoặc về /) — KHÔNG dùng glob
  // (bài học SF-5: false-positive với query next chứa đích).
  await expect(page).not.toHaveURL(/\/login/);
}

/** Đăng nhập admin (creds từ .env.local — globalSetup đã upsert). */
export async function loginAsAdmin(page: Page): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? "admin@ilec.dev";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD thiếu — .env.local bootstrap sai");
  }
  await loginAs(page, email, password);
}

/** Đích redirect sau khi bị layout chặn /admin: "/" (intl → /en hoặc /vi). */
export function isLocaleRoot(pathname: string): boolean {
  return pathname === "/" || pathname === "/en" || pathname === "/vi";
}

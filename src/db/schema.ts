import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * Bảng chuẩn Auth.js (Drizzle adapter) — session strategy JWT nên
 * `sessions`/`verification_tokens` không dùng trong flow chính nhưng
 * giữ schema đầy đủ để adapter hoạt động đúng mọi code path.
 */
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  // bcrypt hash — chỉ dùng bởi Credentials provider (đăng ký email/password)
  passwordHash: text("password_hash"),
});

export const accounts = pgTable(
  "accounts",
  {
    // Property names giữ SNAKE_CASE đúng schema chính thức @auth/drizzle-adapter
    // (adapter query theo tên property — camelCase sẽ lệch type + SQL)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

/**
 * profiles — spec §4 (bản tối thiểu cho auth; xp/streak/last_active +
 * phần còn lại của schema là SF-2 full migration).
 * - locale: auto-set theo route khi đăng ký email (spec §8)
 * - role: gate /admin (middleware chặn chưa-login; layout re-check DB)
 */
export const profiles = pgTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale", { enum: ["en", "vi"] }).notNull().default("en"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  relaxedMode: boolean("relaxed_mode").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

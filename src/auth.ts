import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { db } from "@/db";
import {
  accounts,
  profiles,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { getProfile } from "@/lib/queries";

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    // Google chỉ register khi có credentials — build/dev không vỡ khi thiếu env
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: { params: { prompt: "select_account" } },
          }),
        ]
      : []),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const email = credentials.email?.toString().trim().toLowerCase();
        const password = credentials.password?.toString() ?? "";
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Lần sign-in (user có giá trị): gắn id + hydrate role/locale từ profiles
      // vào JWT. Role đổi sau này có hiệu lực ở lần đăng nhập kế — chấp nhận v1.
      if (user?.id) {
        token.id = user.id;
        const profile = await getProfile(user.id).catch(() => null);
        token.role = profile?.role ?? "user";
        token.locale = profile?.locale ?? "en";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id;
      }
      session.user.role = token.role ?? "user";
      session.user.locale = token.locale ?? "en";
      return session;
    },
  },
  events: {
    // OAuth sign-in lần đầu: adapter tạo users + accounts — tạo profiles theo
    // (locale mặc định 'en'; email register set locale qua register action)
    createUser: async ({ user }) => {
      if (!user.id) return;
      await db
        .insert(profiles)
        .values({
          id: user.id,
          displayName: user.name ?? null,
          avatarUrl: user.image ?? null,
        })
        .onConflictDoNothing();
    },
  },
});

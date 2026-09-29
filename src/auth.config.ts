import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js config EDGE-SAFE — không import bcrypt/db (middleware chạy edge).
 * Providers + adapter thêm ở src/auth.ts (Node runtime).
 */
export const authConfig = {
  pages: {
    signIn: "/en/login",
  },
  session: {
    strategy: "jwt",
  },
  // Vercel preview URL + local dev đều đổi host — tin host từ request
  trustHost: true,
  providers: [],
} satisfies NextAuthConfig;

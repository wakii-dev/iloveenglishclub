import createMiddleware from "next-intl/middleware";
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { routing } from "@/i18n/routing";

/**
 * Middleware gộp (thứ tự quan trọng):
 * 1. `/admin` — NGOÀI next-intl routing (spec §3: không bị redirect /en/admin).
 *    Chặn chưa-login bằng JWT session (edge-safe, không query DB); role admin
 *    re-check ở src/app/(admin)/admin/layout.tsx bằng DB — không tin middleware một mình.
 * 2. Còn lại — next-intl locale routing (`/` → `/en`, `/vi/...` passthrough).
 *
 * Pattern documented Auth.js v5: auth() nhận handler và trả middleware
 * Next-compatible (request, event) — mọi request đi qua đây, handler tự điều phối.
 */
const intlMiddleware = createMiddleware(routing);

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!req.auth) {
      const loginUrl = new URL(`/${routing.defaultLocale}/login`, req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return intlMiddleware(req);
});

export const config = {
  // Bỏ api (Auth.js routes), _next, _vercel, file tĩnh có extension
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

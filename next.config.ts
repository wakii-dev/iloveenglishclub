import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // postgres.js dùng dynamic require/node:net — bị bundle bởi Turbopack sẽ
  // treo vĩnh viễn khi query (đã tái hiện: registerAction kẹt ở insert,
  // node thuần cùng URL chạy OK 2.6s). External = Next require nguyên bản.
  serverExternalPackages: ["postgres"],
  // next-intl load messages/{locale}/*.json bằng fs.readdir lúc RUNTIME —
  // không trace vào lambda thì Vercel 500 ENOENT /var/task/messages/en
  // (fix deploy 2026-09-29, khuyến nghị chính thức của docs next-intl).
  outputFileTracingIncludes: {
    "/**": ["./messages/**"],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

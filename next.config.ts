import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // postgres.js dùng dynamic require/node:net — bị bundle bởi Turbopack sẽ
  // treo vĩnh viễn khi query (đã tái hiện: registerAction kẹt ở insert,
  // node thuần cùng URL chạy OK 2.6s). External = Next require nguyên bản.
  serverExternalPackages: ["postgres"],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

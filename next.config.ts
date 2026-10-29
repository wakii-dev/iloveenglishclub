import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Tailwind v4 chạy qua Turbopack loader; cacheComponents/partialPrefetching là
// mặc định của create-next-app 16 (bộ config đã build-xanh ở spike Next).
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // next-intl load messages/{locale}/*.json bằng fs.readdir lúc RUNTIME —
  // không trace vào lambda thì deploy 500 ENOENT messages/en (khuyến nghị
  // chính thức của docs next-intl; fix deploy ilec 2026-09-29).
  outputFileTracingIncludes: {
    "/**": ["./messages/**"],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);

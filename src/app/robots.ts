import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

/**
 * /robots.txt (SF-7 spec §4.4) — body pinned: allow tất cả trừ /admin
 * (role-gated) và /api (auth routes); sitemap absolute.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

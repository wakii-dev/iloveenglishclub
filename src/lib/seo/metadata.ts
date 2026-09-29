import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildAlternates, BRAND, localePath, siteUrl } from "./site";

/**
 * Shared shape cho sibling metadata layouts (SF-7 spec §4.1) — mỗi layout
 * public gọi buildPageMetadata() với dữ liệu route của mình. metadataBase set
 * ở MỖI layout (không đụng [locale]/layout.tsx của SF-1); page-level
 * generateMetadata của SF-2/SF-4 (title) thắng layout cùng segment — layout
 * KHÔNG set title cho các route đó.
 */
export async function buildPageMetadata(options: {
  locale: string;
  path?: string;
  title?: { absolute: string };
  description?: string;
}): Promise<Metadata> {
  const { locale, path = "", title, description } = options;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    metadataBase: new URL(siteUrl()),
    alternates: buildAlternates(locale, path),
    openGraph: {
      ...(title ? { title: title.absolute } : {}),
      ...(description ? { description } : {}),
      url: localePath(locale, path),
      siteName: BRAND,
      locale,
      type: "website",
    },
  };
}

export async function getSeoMessages(locale: string) {
  return getTranslations({ locale, namespace: "seo" });
}

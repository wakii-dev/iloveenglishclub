import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Home metadata (SF-7) — route group (home) ẩn với URL; đây là route DUY NHẤT
 * không có page-level metadata nên layout đặt title absolute theo locale
 * (spec §4.1). page.tsx được git mv vào (home) — content 0 đổi.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo" });
  return buildPageMetadata({
    locale,
    title: { absolute: t("homeTitle") },
    description: t("homeDescription"),
  });
}

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

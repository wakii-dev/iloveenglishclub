import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo/metadata";

/**
 * Books index metadata (SF-7) — KHÔNG set title: books/page.tsx (SF-2) đã trả
 * title localized, cùng segment page thắng layout (source Next
 * accumulateMetadata) (spec §4.1).
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
    path: "/books",
    description: t("booksDescription"),
  });
}

export default function BooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

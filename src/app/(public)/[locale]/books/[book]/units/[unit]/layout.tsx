import type { Metadata } from "next";
import { buildPageMetadata, getSeoMessages } from "@/lib/seo/metadata";
import { composeDescription } from "@/lib/seo/site";
import { getBook, getUnit } from "@/lib/content/queries";

/**
 * Unit metadata (SF-7 spec §4.1) — KHÔNG set title (page.tsx SF-2 trả);
 * unit.desc nullable → fallback template.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string }>;
}): Promise<Metadata> {
  const { locale, book, unit } = await params;
  const [t, bookRow, unitRow] = await Promise.all([
    getSeoMessages(locale),
    getBook(book, locale),
    getUnit(book, unit, locale),
  ]);
  const description = composeDescription(
    unitRow?.description,
    String(t.raw("unitDescriptionFallback")),
    {
      unitTitle: unitRow?.title ?? "",
      bookTitle: bookRow?.title ?? "",
    },
  );
  return buildPageMetadata({
    locale,
    path: `/books/${book}/units/${unit}`,
    description,
  });
}

export default function UnitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

import type { Metadata } from "next";
import { buildPageMetadata, getSeoMessages } from "@/lib/seo/metadata";
import { absoluteUrl, composeDescription, localePath } from "@/lib/seo/site";
import { course, jsonldScript } from "@/lib/seo/jsonld";
import { getBook } from "@/lib/content/queries";

/**
 * Book metadata + JSON-LD Course (SF-7 spec §4.1/§4.3) — KHÔNG set title
 * (page.tsx SF-2 trả). descEn/descVi nullable → composeDescription fallback
 * template — không bao giờ emit description rỗng.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}): Promise<Metadata> {
  const { locale, book } = await params;
  const [t, bookRow] = await Promise.all([getSeoMessages(locale), getBook(book, locale)]);
  const description = composeDescription(
    bookRow?.description,
    String(t.raw("bookDescriptionFallback")),
    { bookTitle: bookRow?.title ?? "", cefr: bookRow?.cefrLabel ?? "" },
  );
  return buildPageMetadata({
    locale,
    path: `/books/${book}`,
    description,
  });
}

export default async function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book } = await params;
  const [t, bookRow] = await Promise.all([getSeoMessages(locale), getBook(book, locale)]);
  return (
    <>
      {children}
      {bookRow ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonldScript(
              course({
                name: bookRow.title,
                description: composeDescription(
                  bookRow.description,
                  String(t.raw("bookDescriptionFallback")),
                  { bookTitle: bookRow.title, cefr: bookRow.cefrLabel },
                ),
                url: absoluteUrl(localePath(locale, `/books/${book}`)),
                cefr: bookRow.cefrLabel,
              }),
            ),
          }}
        />
      ) : null}
    </>
  );
}

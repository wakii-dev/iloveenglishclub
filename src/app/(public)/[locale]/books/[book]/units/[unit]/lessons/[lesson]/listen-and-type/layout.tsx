import type { Metadata } from "next";
import { buildPageMetadata, getSeoMessages } from "@/lib/seo/metadata";
import { absoluteUrl, composeDescription, localePath } from "@/lib/seo/site";
import { course, learningResource } from "@/lib/seo/jsonld";
import { getBook, getLesson } from "@/lib/content/queries";

/**
 * Lesson metadata + JSON-LD LearningResource (SF-7 spec §4.1/§4.3) — sibling
 * layout bên cạnh page.tsx SF-4 (file này KHÔNG đụng page.tsx — chống merge
 * conflict). KHÔNG set title (page SF-4 trả); lessons KHÔNG có cột description
 * (critic P0) → composeDescription từ template seo.lessonDescription.
 * JSON-LD render ở body — hợp lệ cho Google/validator.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{
    locale: string;
    book: string;
    unit: string;
    lesson: string;
  }>;
}): Promise<Metadata> {
  const { locale, book, unit, lesson } = await params;
  const [t, lessonRow, bookRow] = await Promise.all([
    getSeoMessages(locale),
    getLesson(book, unit, lesson, locale),
    getBook(book, locale),
  ]);
  // t.raw() — template có {var}: t() format ICU eager sẽ ném FORMATTING_ERROR
  // khi chưa có vars; raw + composeDescription tự interpolate (pure, tested).
  const description = composeDescription(
    null,
    String(t.raw("lessonDescription")),
    {
      lessonTitle: lessonRow?.title ?? "",
      bookTitle: bookRow?.title ?? "",
      cefr: bookRow?.cefrLabel ?? "",
    },
  );
  return buildPageMetadata({
    locale,
    path: `/books/${book}/units/${unit}/lessons/${lesson}/listen-and-type`,
    description,
  });
}

export default async function LessonDictationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
    book: string;
    unit: string;
    lesson: string;
  }>;
}) {
  const { locale, book, unit, lesson } = await params;
  const [t, lessonRow, bookRow] = await Promise.all([
    getSeoMessages(locale),
    getLesson(book, unit, lesson, locale),
    getBook(book, locale),
  ]);
  const path = `/books/${book}/units/${unit}/lessons/${lesson}/listen-and-type`;
  const showJsonLd = lessonRow && bookRow;
  return (
    <>
      {children}
      {showJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              learningResource({
                name: lessonRow.title,
                url: absoluteUrl(localePath(locale, path)),
                cefr: bookRow.cefrLabel,
                course: course({
                  name: bookRow.title,
                  description: composeDescription(
                    bookRow.description,
                    String(t.raw("bookDescriptionFallback")),
                    { bookTitle: bookRow.title, cefr: bookRow.cefrLabel },
                  ),
                  url: absoluteUrl(localePath(locale, `/books/${book}`)),
                  cefr: bookRow.cefrLabel,
                }),
              }),
            ),
          }}
        />
      ) : null}
    </>
  );
}

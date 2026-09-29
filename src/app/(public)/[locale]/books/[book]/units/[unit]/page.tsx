import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { LessonRow } from "@/components/content/lesson-row";
import { Link } from "@/i18n/navigation";
import {
  getBook,
  getBooks,
  getLessons,
  getUnit,
  getUnits,
} from "@/lib/content/queries";

/**
 * /books/[book]/units/[unit] — §2.5: page-head (breadcrumb + h1 + lead) +
 * LessonList (tag loại + tên + số câu). SSG với generateStaticParams từ DB.
 */
export const revalidate = 300;

export async function generateStaticParams() {
  const out: { book: string; unit: string }[] = [];
  const books = await getBooks("en");
  for (const b of books) {
    const units = await getUnits(b.slug, "en");
    for (const u of units) {
      out.push({ book: b.slug, unit: String(u.number) });
    }
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string }>;
}): Promise<Metadata> {
  const { locale, book, unit } = await params;
  const [t, bookRow, unitRow] = await Promise.all([
    getTranslations({ locale, namespace: "books" }),
    getBook(book, locale),
    getUnit(book, unit, locale),
  ]);
  return {
    title: unitRow ? `${unitRow.title} · ${bookRow?.title ?? book}` : t("levels.title"),
  };
}

export default async function UnitPage({
  params,
}: {
  params: Promise<{ locale: string; book: string; unit: string }>;
}) {
  const { locale, book: bookSlug, unit } = await params;
  setRequestLocale(locale);
  const [t, book, unitRow] = await Promise.all([
    getTranslations("books"),
    getBook(bookSlug, locale),
    getUnit(bookSlug, unit, locale),
  ]);
  if (!book || !unitRow) notFound();
  const lessons = await getLessons(bookSlug, unit, locale);

  return (
    <div className="mx-auto max-w-[820px] px-6 py-12">
      {/* Breadcrumb (§2.5): Unit / **bài học** màu primary */}
      <nav aria-label="breadcrumb" className="text-[13.5px] font-bold">
        <Link
          href="/books"
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("book.backToLevels")}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <Link
          href={`/books/${bookSlug}`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {book.title}
        </Link>
      </nav>

      <h1 className="mt-3 font-display text-[33px] leading-tight font-bold tracking-tight">
        {unitRow.title}
      </h1>
      <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
        {t("unit.lessonsCount", { count: unitRow.lessonCount })}
        {unitRow.description ? ` · ${unitRow.description}` : null}
      </p>

      {lessons.length === 0 ? (
        <p className="mt-8 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
          {t("book.lessons")} — 0
        </p>
      ) : (
        <ol className="mt-7 flex flex-col gap-3">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <LessonRow
                lesson={lesson}
                bookSlug={bookSlug}
                unitNumber={unitRow.number}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

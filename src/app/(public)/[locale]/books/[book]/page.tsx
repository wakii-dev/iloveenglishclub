import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { BookCover } from "@/components/content/book-cover";
import { UnitRow } from "@/components/content/unit-row";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getBook, getBooks, getUnits } from "@/lib/content/queries";

/**
 * /books/[book] — §2.4: grid 300px/1fr — aside cover + MetaList, main UnitList.
 * SSG: generateStaticParams từ DB (build không DB → [] = ISR on-demand heal).
 */
export const revalidate = 300;

export async function generateStaticParams() {
  const books = await getBooks("en");
  return books.map((b) => ({ book: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}): Promise<Metadata> {
  const { locale, book } = await params;
  const [t, row] = await Promise.all([
    getTranslations({ locale, namespace: "books" }),
    getBook(book, locale),
  ]);
  return { title: row ? `${row.title} · ${row.cefrLabel}` : t("levels.title") };
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book: bookSlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("books");
  const book = await getBook(bookSlug, locale);
  if (!book) notFound();
  const units = await getUnits(bookSlug, locale);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <Link
        href="/books"
        className="inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("book.backToLevels")}
      </Link>

      <div className="mt-5 grid grid-cols-1 gap-11 lg:grid-cols-[300px_1fr]">
        {/* Aside — cover + meta (§2.4) */}
        <aside className="flex flex-col items-start gap-5">
          <BookCover book={book} />
          <dl className="w-full rounded-[18px] border-2 border-border bg-card p-5 text-[13.5px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="font-bold text-muted-foreground">{t("book.cefr")}</dt>
              <dd className="rounded-full bg-muted px-2.5 py-0.5 font-extrabold">
                {book.cefrLabel}
              </dd>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 border-t-2 border-border pt-3">
              <dt className="font-bold text-muted-foreground">{t("book.targetExam")}</dt>
              <dd className="text-right font-extrabold">
                {book.examTarget ?? t("book.noExam")}
              </dd>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 border-t-2 border-border pt-3 tabular-nums">
              <dt className="font-bold text-muted-foreground">{t("book.units")}</dt>
              <dd className="font-extrabold">{book.unitCount}</dd>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 border-t-2 border-border pt-3 tabular-nums">
              <dt className="font-bold text-muted-foreground">{t("book.lessons")}</dt>
              <dd className="font-extrabold">{book.lessonCount}</dd>
            </div>
          </dl>
        </aside>

        {/* UnitList (§2.4) */}
        <div>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
            {book.title}
          </h1>
          {book.description ? (
            <p className="mt-2 text-[15px] font-semibold text-muted-foreground">
              {book.description}
            </p>
          ) : null}

          {units.length === 0 ? (
            <p className="mt-8 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
              {t("book.units")} — 0
            </p>
          ) : (
            <ol className="mt-6 flex flex-col gap-3">
              {units.map((unit) => (
                <li key={unit.id}>
                  <UnitRow unit={unit} bookSlug={bookSlug} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

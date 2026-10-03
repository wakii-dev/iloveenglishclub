import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getBook, getBooks, getBookVocabulary } from "@/lib/content/queries";

/**
 * /books/[book]/vocabulary — từ vựng của book theo thứ tự học (SF-2 t-2.1).
 * Public như trang books (middleware chỉ gate /admin); SSG + ISR 300 cùng
 * pattern book page — admin mutation gọi revalidateContent() (tag `content`).
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
    getTranslations({ locale, namespace: "vocabulary" }),
    getBook(book, locale),
  ]);
  return { title: row ? `${t("title")} · ${row.title}` : t("title") };
}

export default async function BookVocabularyPage({
  params,
}: {
  params: Promise<{ locale: string; book: string }>;
}) {
  const { locale, book: bookSlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vocabulary");
  const book = await getBook(bookSlug, locale);
  if (!book) notFound();
  const vocab = await getBookVocabulary(bookSlug);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <Link
        href={`/books/${bookSlug}`}
        className="inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("backToBook")}
      </Link>

      <div className="mt-5">
        <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
          {t("title")}
        </h1>
        {vocab.length > 0 ? (
          <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
            {t("lead", { book: book.title, count: vocab.length })}
          </p>
        ) : null}
      </div>

      {vocab.length === 0 ? (
        <p className="mt-8 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="mt-6 flex flex-col gap-3">
          {vocab.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-4 rounded-[18px] border-2 border-border bg-card p-4"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[16.5px] font-bold">
                    {entry.word}
                  </span>
                  {entry.ipa ? (
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      /{entry.ipa}/
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                  {entry.meaningVi}
                </span>
                {entry.example ? (
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground italic">
                    {entry.example}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

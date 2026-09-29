import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { LevelCard } from "@/components/content/level-card";
import { getBooks } from "@/lib/content/queries";

/**
 * /books — danh sách 7 sách (SSG + revalidate 300, data qua queries.ts có
 * tag `content` — SF-5 publish gọi revalidateContent là stale).
 */
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "books" });
  return { title: t("levels.title") };
}

export default async function BooksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("books");
  const books = await getBooks(locale);

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-12">
      <h1 className="font-display text-[33px] leading-tight font-bold tracking-tight">
        {t("levels.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[15.5px] font-semibold text-muted-foreground">
        {t("levels.subtitle")}
      </p>

      {books.length === 0 ? (
        <p className="mt-10 rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] text-muted-foreground">
          {t("levels.title")} — 0/7
        </p>
      ) : (
        <div className="mt-8 flex flex-wrap gap-[18px]">
          {books.map((book) => (
            <LevelCard key={book.slug} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}

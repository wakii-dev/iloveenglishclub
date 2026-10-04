import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { VocabularyManager } from "@/components/admin/vocabulary-manager";
import { getAdminBookBySlug } from "@/lib/admin/queries";
import { listVocabulary } from "@/lib/admin/vocabulary-store";

/**
 * /admin/books/[book]/vocabulary — từ vựng của 1 book (SF-1 t-1.3).
 * Data nạp server qua vocabulary-store (cùng leg với API t-1.2); CRUD/audio/
 * import phía client component gọi REST rồi refetch. Slug sai → notFound.
 */
export default async function AdminVocabularyPage({
  params,
}: {
  params: Promise<{ book: string }>;
}) {
  const { book: bookSlug } = await params;
  const t = await getTranslations({ locale: "vi", namespace: "admin" });
  const book = await getAdminBookBySlug(bookSlug);
  if (!book) notFound();
  const { items } = await listVocabulary({
    bookId: book.id,
    limit: 200,
    offset: 0,
  });

  return (
    <div className="space-y-6">
      <nav aria-label="breadcrumb" className="text-[13.5px] font-bold">
        <Link
          href="/admin/books"
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("books.title")}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <Link
          href={`/admin/books/${bookSlug}/units`}
          className="text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {book.titleVi ?? book.titleEn}
        </Link>
        <span aria-hidden className="mx-2 text-muted-foreground/60">/</span>
        <span className="text-foreground">{t("vocabulary.title")}</span>
      </nav>

      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("vocabulary.title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("vocabulary.lead")}
        </p>
      </div>

      <VocabularyManager
        bookId={book.id}
        initialRows={items.map((w) => ({
          id: w.id,
          word: w.word,
          ipa: w.ipa,
          meaning_vi: w.meaning_vi,
          example: w.example,
          audio_url: w.audio_url,
          // SF-3 (VU-35): badge CEFR + nguồn — store SF-2 đã select 2 trường
          cefr: w.cefr,
          source: w.source,
        }))}
      />

      <Link
        href={`/admin/books/${bookSlug}/units`}
        className="inline-flex items-center gap-1 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("units.title")}
      </Link>
    </div>
  );
}

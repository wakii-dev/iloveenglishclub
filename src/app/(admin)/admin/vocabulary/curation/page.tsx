import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { books } from "@/db/schema";
import { CurationBrowser } from "@/components/admin/curation-browser";
import { VocabularySubNav } from "@/components/admin/vocabulary-sub-nav";

/**
 * /admin/vocabulary/curation — curation queue Oxford (VU-43 SF-3): duyệt
 * crawl_entries (READ-ONLY lake), grid soạn nghĩa VI teacher-in-loop, promote
 * + audio backfill. Server shell (role-gate ở admin layout) + VocabularySubNav
 * (tier-0 SF-1 — render-only); danh sách books nạp server-side cho select
 * promote/backfill (admin NGOÀI [locale] — UI tiếng Việt cố định).
 *
 * Namespace server = KEY TÊN FILE ("vocab-curation") — request config
 * (src/i18n/request.ts) build messages theo filename; key camelCase
 * "vocabCuration" chỉ tồn tại ở NextIntlClientProvider (client — layout map
 * tay). Sai key → render literal "vocabCuration.title" (e2e bắt được).
 */
export default async function AdminVocabularyCurationPage() {
  const t = await getTranslations({ locale: "vi", namespace: "vocab-curation" });
  const bookRows = await db
    .select({ id: books.id, titleVi: books.titleVi, titleEn: books.titleEn })
    .from(books)
    .orderBy(asc(books.sortOrder));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("lead")}
        </p>
      </div>
      <VocabularySubNav />
      <CurationBrowser
        books={bookRows.map((book) => ({
          id: book.id,
          label: book.titleVi ?? book.titleEn,
        }))}
      />
    </div>
  );
}

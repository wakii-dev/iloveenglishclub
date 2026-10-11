import { getTranslations } from "next-intl/server";
import { VocabularyCatalog } from "@/components/admin/vocabulary-catalog";
import { VocabularySubNav } from "@/components/admin/vocabulary-sub-nav";
import { getAdminBooks } from "@/lib/admin/queries";

export const metadata = {
  title: "Từ vựng · Quản trị · I Love English Club",
  robots: { index: false, follow: false },
};

/**
 * /admin/vocabulary — Catalog toàn cục (VU-43 SF-2 t1). Server shell: role-gate
 * ở admin layout CÓ SẴN (không tự làm); danh sách books nạp server 1 lần
 * (getAdminBooks) truyền xuống client (filter select + bulk gán sách dùng);
 * bảng + filters phía client REST pagination (cùng pattern VocabularyManager /
 * CrawlDashboard — design language admin). Sub-nav tier-0 SF-1 chỉ render.
 */
export default async function AdminVocabularyCatalogPage() {
  const t = await getTranslations({ locale: "vi", namespace: "vocabCatalog" });
  const books = await getAdminBooks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">
          {t("lead")}
        </p>
      </div>
      <VocabularySubNav />
      <VocabularyCatalog
        books={books.map((b) => ({
          id: b.id,
          slug: b.slug,
          title: b.titleVi ?? b.titleEn,
        }))}
      />
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { VocabularySubNav } from "@/components/admin/vocabulary-sub-nav";
import { VocabStats } from "@/components/admin/vocab-stats";

export const metadata = {
  title: "Thống kê từ vựng · Quản trị · I Love English Club",
  robots: { index: false, follow: false },
};

/**
 * /admin/vocabulary/stats — Stats dashboard (VU-43 SF-4 t1). Server shell:
 * role-gate ở admin layout CÓ SẴN; sub-nav tier-0 SF-1 render-only — từ trang
 * này link Stats trên sub-nav HẾT 404 (phase-1 dead-link gỡ). Data phía client
 * wire GET /api/admin/vocabulary/stats (SF-1) — component vocab-stats.
 *
 * Namespace server = tên FILE (`vocab-stats` — loader request config đọc theo
 * basename); CLIENT nhận camelCase `vocabStats` từ NextIntlClientProvider của
 * admin layout (SF-1 pin) — 2 tên 1 file, đừng "thống nhất" bằng cách sửa
 * layout (READ-ONLY SF-1).
 */
export default async function AdminVocabularyStatsPage() {
  const t = await getTranslations({ locale: "vi", namespace: "vocab-stats" });

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
      <VocabStats />
    </div>
  );
}

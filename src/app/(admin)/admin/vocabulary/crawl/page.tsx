import { getTranslations } from "next-intl/server";
import { CrawlDashboard } from "@/components/admin/crawl-dashboard";

/**
 * /admin/vocabulary/crawl — dashboard crawl Oxford (VU-32 SF-3, context pack
 * §1-2). Server shell (role-gate ở admin layout); stats/controls phía client
 * gọi API SF-2 (GET stats + POST control — READ-ONLY với SF này).
 */
export default async function AdminCrawlPage() {
  const t = await getTranslations({ locale: "vi", namespace: "admin.crawl" });

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
      <CrawlDashboard />
    </div>
  );
}

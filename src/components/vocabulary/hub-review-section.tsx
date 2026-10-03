import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getHubStats } from "@/lib/vocabulary/hub-store";

/**
 * Tab Ôn tập (SF-3 t-3.1) — panel thống kê due-today (tổng mọi nguồn, cùng
 * nguồn getHubStats tab Tổng quan) + nút mở flow flashcard /me/vocabulary
 * (?scope=all mặc định). Flow lật thẻ/chấm quality sống ở trang đó — hub chỉ
 * dẫn vào, không nhân bản engine. Guest không bao giờ render section này
 * (page điều phối redirect login như tab Tổng quan).
 */
export async function HubReviewSection({ userId }: { userId: string }) {
  const t = await getTranslations("vocabulary");
  const stats = await getHubStats(userId);

  return (
    <section
      aria-labelledby="review-heading"
      className="mt-6 rounded-[18px] border-2 border-border bg-card p-6"
    >
      <h2 id="review-heading" className="font-display text-[20px] font-bold">
        {t("reviewTitle")}
      </h2>
      <p className="mt-2 text-[15px] font-semibold text-muted-foreground tabular-nums">
        {t("dueToday", { count: stats.dueToday })}
      </p>
      <div className="mt-5">
        <Link
          href="/me/vocabulary?scope=all"
          className={buttonVariants({})}
        >
          {t("hub.review.start")}
        </Link>
      </div>
    </section>
  );
}

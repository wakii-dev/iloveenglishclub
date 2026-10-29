import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { BADGE_POOL } from "@/lib/today/badges";

/**
 * Badge strip (daily-journey SF-3, VU-51 — hand-off §5 + spec §2.1): badge
 * ĐÃ nhận + locked với mốc KẾ TIẾP GẦN NHẤT theo từng metric (BADGE_POOL
 * thuần — import an toàn, không crypto như quests.ts). Owned từ snapshot
 * (đã union newly — SF-2). Server component.
 */
export function TodayBadgeStrip({ owned }: { owned: string[] }) {
  const t = useTranslations("today");
  const ownedSet = new Set(owned);

  // Mốc kế tiếp gần nhất (chưa đạt) theo metric — mốc cuối cùng của metric
  // đã đạt hết thì không hiện locked cho metric đó
  const nextLockedByMetric = new Map<string, string>();
  for (const def of BADGE_POOL) {
    if (ownedSet.has(def.badgeId)) continue;
    const prev = nextLockedByMetric.get(def.metric);
    if (!prev) nextLockedByMetric.set(def.metric, def.badgeId);
  }
  const nextLocked = [...nextLockedByMetric.values()];

  return (
    <section
      aria-labelledby="today-badges-heading"
      className="rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-dash-card"
    >
      <h2
        id="today-badges-heading"
        className="font-display text-[19px] font-extrabold"
      >
        {t("badges.heading")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {owned.map((badgeId) => (
          <span
            key={badgeId}
            data-testid={`badge-${badgeId}`}
            title={t(`badges.${badgeId}.desc`)}
            className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-gold-soft-line bg-gold-soft px-3 py-1.5 text-[12.5px] font-extrabold text-gold"
          >
            {t(`badges.${badgeId}.title`)}
            <span className="sr-only">{t("badges.earned")}</span>
          </span>
        ))}
        {nextLocked.map((badgeId) => (
          <span
            key={badgeId}
            data-testid={`badge-locked-${badgeId}`}
            title={t(`badges.${badgeId}.desc`)}
            className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-border px-3 py-1.5 text-[12.5px] font-bold text-muted-foreground"
          >
            <Lock aria-hidden className="size-3" />
            {t("badges.next", {
              milestone: t(`badges.${badgeId}.title`),
            })}
          </span>
        ))}
        {owned.length === 0 && nextLocked.length === 0 ? (
          <p className="text-[13px] font-semibold text-muted-foreground">
            {t("badges.heading")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

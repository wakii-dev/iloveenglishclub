import { Flame, Shield } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Streak + shield card (daily-journey SF-3, VU-51 — hand-off §6 + spec
 * §2.1): streak số LIVE từ snapshot (computeStreak freeze-aware — KHÔNG
 * cache profiles). Shield READ-ONLY credits/cap + mô tả cơ chế trung tính —
 * Phase 1 CHƯA có freeze rows consume (SF-4) nên KHÔNG hiển thị "được bảo
 * vệ" (boundary context pack).
 */
export function TodayStreakCard({
  streak,
  shieldCredits,
  shieldCap,
}: {
  streak: number;
  shieldCredits: number;
  shieldCap: number;
}) {
  const t = useTranslations("today");

  return (
    <section
      aria-labelledby="today-streak-heading"
      className="rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-dash-card"
    >
      <h2
        id="today-streak-heading"
        className="font-display text-[19px] font-extrabold"
      >
        {t("streak.heading")}
      </h2>
      <p className="mt-2.5 flex items-center gap-2">
        <Flame aria-hidden className="size-6 text-[#f97316]" />
        <span className="font-display text-[27px] font-extrabold tabular-nums">
          {t("streak.days", { count: streak })}
        </span>
      </p>
      <div className="mt-3 rounded-[14px] border-2 border-dashed border-gold-soft-line bg-gold-soft/50 p-3">
        <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-gold">
          <Shield aria-hidden className="size-4" />
          {t("streak.shieldTitle")}
          <span
            data-testid="today-shield-credits"
            className="ml-auto tabular-nums"
          >
            {t("streak.shieldCredits", {
              credits: shieldCredits,
              cap: shieldCap,
            })}
          </span>
        </p>
        <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-muted-foreground">
          {t("streak.shieldDesc", { cap: shieldCap })}
        </p>
      </div>
    </section>
  );
}

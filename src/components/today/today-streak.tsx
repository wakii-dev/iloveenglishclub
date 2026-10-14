import { Flame, Shield, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Streak + shield card (daily-journey SF-3, VU-51 — hand-off §6 + spec
 * §2.1): streak số LIVE từ snapshot (computeStreak freeze-aware — KHÔNG
 * cache profiles). SF-4 (VU-52): freeze rows consume thật nên card hiển thị
 * state "được bảo vệ" khi snapshot còn freeze (recomputeStreakTx CHỈ tạo
 * freeze cho gap trong lookback — freeze đang tồn tại = đang bridge chuỗi;
 * hiển thị ngày freeze GẦN NHẤT). Read-only — consume KHÔNG xảy ra ở render.
 */
export function TodayStreakCard({
  streak,
  shieldCredits,
  shieldCap,
  shieldFreezes,
}: {
  streak: number;
  shieldCredits: number;
  shieldCap: number;
  shieldFreezes: string[];
}) {
  const t = useTranslations("today");
  const protectedDay = [...shieldFreezes].sort().at(-1);

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
      {protectedDay ? (
        <div
          data-testid="today-shield-active"
          className="mt-3 rounded-[14px] border-2 border-gold-soft-line bg-gold-soft/50 p-3"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-gold">
            <ShieldCheck aria-hidden className="size-4" />
            {t("streak.shieldActiveTitle")}
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
            {t("streak.shieldActiveDesc", { date: protectedDay })}
          </p>
        </div>
      ) : (
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
      )}
    </section>
  );
}

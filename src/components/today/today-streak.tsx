import { Flame, Shield, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { addDays, vnToday } from "@/lib/gamification/streak";

/**
 * Freeze "đang covering gap gần nhất" — review P1-1 (VU-52): freeze ngoài
 * chuỗi hiển thị (stale — snapshot cũ còn row, gap mới KHÔNG cover) KHÔNG
 * được tính "được bảo vệ". Freeze gần nhất phải nằm trong window chuỗi
 * [cursor−(streak−1) .. cursor] với cursor = today nếu activeToday, else
 * yesterday (semantics computeStreak). Pure — test pin today-streak.test.ts.
 */
export function shieldCoveringGap(
  freezeDates: readonly string[],
  streak: number,
  activeToday: boolean,
  today: string,
): string | null {
  if (streak <= 0) return null;
  const latest = [...freezeDates].sort().at(-1);
  if (!latest) return null;
  const cursor = activeToday ? today : addDays(today, -1);
  return latest >= addDays(cursor, -(streak - 1)) ? latest : null;
}

/**
 * Streak + shield card (daily-journey SF-3, VU-51 — hand-off §6 + spec
 * §2.1): streak số LIVE từ snapshot (computeStreak freeze-aware — KHÔNG
 * cache profiles). SF-4 (VU-52): freeze rows consume thật nên card hiển thị
 * state "được bảo vệ" khi snapshot còn freeze COVERING GAP (recomputeStreakTx
 * CHỈ tạo freeze cho gap trong lookback — freeze nằm trong chuỗi hiển thị =
 * đang bridge; stale freeze sâu hơn chuỗi KHÔNG tính). Read-only — consume
 * KHÔNG xảy ra ở render.
 */
export function TodayStreakCard({
  streak,
  activeToday,
  shieldCredits,
  shieldCap,
  shieldFreezes,
}: {
  streak: number;
  activeToday: boolean;
  shieldCredits: number;
  shieldCap: number;
  shieldFreezes: string[];
}) {
  const t = useTranslations("today");
  const protectedDay = shieldCoveringGap(
    shieldFreezes,
    streak,
    activeToday,
    vnToday(new Date()),
  );

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

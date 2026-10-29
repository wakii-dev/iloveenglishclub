import { useTranslations } from "next-intl";
import { GoalEditors } from "./goal-editors";
import { GoalRing } from "./goal-ring";

/**
 * Hero goal kép (daily-journey SF-3, VU-51 — hand-off §1 + spec §2.1):
 * 2 ring phút nghe / từ ôn-luyện CÙNG HÀNG desktop (direction A
 * dashboard-dense), celebration "hoàn thành cả 2" tĩnh (reduced-motion
 * safe — không animation), chú thích "phút ước tính từ audio" khi bài gợi
 * ý hiện tại có part thiếu duration. Goal editors inline cùng card.
 * SERVER component — số liệu từ getTodaySnapshot (page truyền props).
 */
export function TodayHero({
  listenMinutes,
  goalMinutes,
  practiced,
  goalWords,
  durationHint,
}: {
  listenMinutes: number;
  goalMinutes: number;
  practiced: number;
  goalWords: number;
  durationHint: boolean;
}) {
  const t = useTranslations("today");
  const allDone = listenMinutes >= goalMinutes && practiced >= goalWords;

  return (
    <section
      aria-labelledby="today-hero-heading"
      className="rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-dash-card"
    >
      <h2
        id="today-hero-heading"
        className="font-display text-[19px] font-extrabold"
      >
        {t("hero.heading")}
      </h2>

      <div className="mt-3 flex items-center justify-around gap-3">
        <GoalRing
          done={listenMinutes}
          goal={goalMinutes}
          ariaLabel={t("hero.minutesAria", {
            minutes: listenMinutes,
            goal: goalMinutes,
          })}
          label={t("hero.minutesLabel")}
          strokeClass="stroke-primary"
        >
          {listenMinutes}
        </GoalRing>
        <GoalRing
          done={practiced}
          goal={goalWords}
          ariaLabel={t("hero.wordsAria", {
            practiced,
            goal: goalWords,
          })}
          label={t("hero.wordsLabel")}
          strokeClass="stroke-secondary"
        >
          {practiced}
        </GoalRing>
      </div>

      {allDone ? (
        <p className="mt-3 rounded-[14px] bg-leaf-soft px-4 py-2.5 text-center text-[13.5px] font-bold text-leaf-deep">
          {t("hero.allDone")}
        </p>
      ) : null}
      {durationHint ? (
        <p className="mt-2 text-center text-[11.5px] font-semibold text-muted-foreground">
          {t("hero.durationHint")}
        </p>
      ) : null}

      <GoalEditors minutes={goalMinutes} words={goalWords} />
    </section>
  );
}

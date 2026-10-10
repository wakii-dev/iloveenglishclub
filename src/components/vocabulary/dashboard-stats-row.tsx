import type { VocabT } from "@/components/vocabulary/dashboard-types";
import { Link } from "@/i18n/navigation";
import { DashboardGoalRing } from "@/components/vocabulary/dashboard-goal-ring";
import type { DashboardSummary } from "@/lib/vocabulary/dashboard-store";

/**
 * Stat row 3 card (vocab-memrise SF-4, VU-41 — hand-off §2.1 khối 3):
 * (a) mục tiêu — DashboardGoalRing (client, editor inline);
 * (b) streak — lửa gold "{n} ngày" + note "vocab · dictation đều giữ lửa";
 * (c) đến hạn — icon refresh teal + "n từ đến hạn ôn tập hôm nay" + nút teal
 *     "Ôn ngay" → /me/vocabulary?scope=all (contract cũ — context pack #5).
 * SYNC + translator qua props — test SSR pin.
 */
export function DashboardStatsRow({
  summary,
  t,
}: {
  summary: DashboardSummary;
  t: VocabT;
}) {
  return (
    <div className="mb-3.5 grid grid-cols-3 gap-2.5">
      <article className="flex flex-col items-center gap-1 rounded-[20px] border-[1.5px] border-border bg-card px-3 py-3.5 text-center">
        <DashboardGoalRing planted={summary.plantedToday} goal={summary.dailyGoalWords} />
      </article>

      <article className="flex flex-col items-center gap-1 rounded-[20px] border-[1.5px] border-border bg-card px-3 py-3.5 text-center">
        {/* lửa — copy proto-A, màu gold-bright */}
        <svg viewBox="0 0 24 24" width="38" height="38" aria-hidden="true" className="block text-gold-bright">
          <path
            d="M12 2c.6 3.4-3.6 5-3.6 8.8a5.1 5.1 0 0 0 10.2 0c0-2.1-1-3.6-2.2-5.2-.3 1.5-1.1 2.2-2.2 2.4.6-1.9-.2-4.1-2.2-6z"
            fill="currentColor"
          />
        </svg>
        <b className="font-display text-[21px] leading-none tabular-nums" aria-label={t("hub.dash.streakDays", { count: summary.streak })}>
          {t("hub.dash.streakDays", { count: summary.streak })}
        </b>
        <span className="text-[11.5px] leading-tight text-muted-foreground">
          {t("hub.dash.streakNote")}
        </span>
      </article>

      <article className="flex flex-col items-center gap-1 rounded-[20px] border-[1.5px] border-border bg-card px-3 py-3.5 text-center">
        <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" className="block text-secondary">
          <path
            d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"
            stroke="currentColor"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <b className="font-display text-[21px] leading-none tabular-nums">
          {t("hub.dash.dueValue", { count: summary.dueToday })}
        </b>
        <span className="text-[11.5px] leading-tight text-muted-foreground">
          {t("hub.dash.dueNote")}
        </span>
        <Link
          href="/me/vocabulary?scope=all"
          className="mt-1.5 flex min-h-10 items-center rounded-xl bg-secondary px-4 py-1.5 text-[13.5px] font-extrabold text-secondary-foreground shadow-[0_3px_0_var(--teal-deep)] transition-transform active:translate-y-[2px] active:shadow-[0_1px_0_var(--teal-deep)]"
        >
          {t("hub.dash.reviewCta")}
        </Link>
      </article>
    </div>
  );
}

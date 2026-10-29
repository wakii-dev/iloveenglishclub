import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TodayQuest } from "@/lib/today/today-store";

/**
 * Quest list (daily-journey SF-3, VU-51 — hand-off §4 + spec §2.1/§2.4):
 * ĐÚNG 3 quest hôm nay từ snapshot — progress bar, done TỰ ĐỘNG (KHÔNG nút
 * claim — auto-record ledger SF-2). aria-live polite nhẹ cho done state.
 * Tên quest = i18n `quests.<questId>.title` (SF-1 defs chỉ id/target).
 */
export function TodayQuestList({ quests }: { quests: TodayQuest[] }) {
  const t = useTranslations("today");

  return (
    <section
      aria-labelledby="today-quests-heading"
      className="rounded-[24px] border-[1.5px] border-border bg-card p-5 shadow-dash-card"
    >
      <h2
        id="today-quests-heading"
        className="font-display text-[19px] font-extrabold"
      >
        {t("quests.heading")}
      </h2>
      <ul className="mt-3 grid gap-3">
        {quests.map((quest) => (
          <li key={quest.questId} data-testid={`quest-${quest.questId}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold">
                  {t(`quests.${quest.questId}.title`)}
                </p>
                <p className="mt-0.5 text-[12px] font-semibold leading-snug text-muted-foreground">
                  {t(`quests.${quest.questId}.desc`)}
                </p>
              </div>
              {quest.done ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-leaf-soft px-2.5 py-1 text-[11.5px] font-extrabold text-leaf-deep">
                  <Check aria-hidden className="size-3.5" />
                  {t("quests.doneLabel")}
                </span>
              ) : (
                <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-muted-foreground">
                  {quest.progress}/{quest.target}
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.min(quest.progress, quest.target)}
              aria-valuemin={0}
              aria-valuemax={quest.target}
              aria-label={t("quests.progressAria", {
                title: t(`quests.${quest.questId}.title`),
                progress: quest.progress,
                target: quest.target,
              })}
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={`h-full rounded-full ${
                  quest.done ? "bg-leaf" : "bg-secondary"
                }`}
                style={{
                  width: `${Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100))}%`,
                }}
              />
            </div>
            {/* aria-live nhẹ — done-state đổi khi RSC refresh sau hoạt động */}
            <span aria-live="polite" className="sr-only">
              {quest.done ? t("quests.doneLabel") : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

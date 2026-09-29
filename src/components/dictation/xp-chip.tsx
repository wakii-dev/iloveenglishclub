"use client";

import { useTranslations } from "next-intl";

/** §3.11 XpChip (plan-critic P1): +N XP live; guest kèm pill "chưa lưu"
 *  phân biệt rõ với user thật (ephemeral ≠ đã lưu). */
export function XpChip({ earnedXp, isGuest }: { earnedXp: number; isGuest: boolean }) {
  const t = useTranslations("lesson");

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 py-1 text-[13px] font-extrabold text-secondary tabular-nums"
      title={isGuest ? t("dictation.xp.unsavedTitle") : undefined}
    >
      {t("dictation.xp.label", { xp: earnedXp })}
      {isGuest ? (
        <em className="rounded-full bg-muted px-1.5 py-px text-[11px] font-extrabold text-muted-foreground not-italic">
          {t("dictation.xp.unsaved")}
        </em>
      ) : null}
    </span>
  );
}

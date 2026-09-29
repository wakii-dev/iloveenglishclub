"use client";

import { Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * §3.5 HintStrip: chips từ đã lộ (thứ tự reveal — thứ tự store) + suffix pill
 * "XP ×0.8" khi part.usedHint (giải thích mark đã-hint — context pack #4).
 */
export function HintStrip({ transcript, revealedIndices, usedHint }: Props) {
  const t = useTranslations("lesson");
  if (revealedIndices.length === 0) return null;

  const tokens = transcript.trim().split(/\s+/);
  const revealed = revealedIndices
    .map((i) => tokens[i])
    .filter((tk): tk is string => tk !== undefined);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[16px] border-2 border-dashed border-ring/60 bg-accent px-4 py-3">
      <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-secondary">
        <Lightbulb aria-hidden className="size-3.5" />
        {t("dictation.hintStrip.label")}
      </span>
      {revealed.map((tk, i) => (
        <span
          key={i}
          className="rounded-full border-2 border-border bg-card px-3 py-1 text-[14px] font-bold"
        >
          {tk}
        </span>
      ))}
      {usedHint ? (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-extrabold text-muted-foreground tabular-nums">
          {t("dictation.hintStrip.xpPenalty")}
        </span>
      ) : null}
    </div>
  );
}

interface Props {
  transcript: string;
  revealedIndices: readonly number[];
  usedHint: boolean;
}

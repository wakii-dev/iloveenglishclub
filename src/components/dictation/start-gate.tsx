"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { lessonFacts } from "@/lib/dictation-ui/format";

/** State START (§5.1): badge eyebrow → h1 → lead → FactPills → nút Start
 *  (user gesture — orchestrator chạy chuỗi start→relaxed-sync→start). */
export function StartGate({
  eyebrow,
  title,
  facts,
  onReadyToStart,
}: {
  eyebrow: string;
  title: string;
  facts: readonly { durationMs: number | null }[];
  onReadyToStart: () => void;
}) {
  const t = useTranslations("lesson");
  const f = lessonFacts(facts);

  return (
    <div className="mx-auto flex max-w-[820px] flex-col items-start px-6 pb-14 pt-[26px]">
      <span className="inline-flex items-center rounded-full bg-secondary/8 px-[13px] py-[5px] text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-secondary">
        {eyebrow}
      </span>
      <h1 className="mt-3.5 font-display text-[38px] leading-[1.1] font-bold tracking-tight">
        {title}
      </h1>
      <p className="mb-5 mt-2 max-w-[50ch] text-[17px] font-semibold text-muted-foreground">
        {t("dictation.start.lead")}
      </p>
      <div className="mb-[26px] flex flex-wrap gap-2.5">
        <Fact label={t("dictation.facts.sentences", { count: f.sentences })} />
        <Fact
          label={t("dictation.facts.audio", {
            seconds: Math.round(f.totalAudioMs / 1000),
          })}
        />
        <Fact label={t("dictation.facts.minutes", { minutes: f.minutesEstimate })} />
        <Fact label={t("dictation.facts.xpMax", { xp: f.xpMax })} />
      </div>
      <button
        type="button"
        onClick={onReadyToStart}
        className="inline-flex items-center gap-2 rounded-[16px] bg-primary px-[30px] py-3.5 font-display text-[16.5px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)]"
      >
        {t("dictation.start.cta")}
        <Play aria-hidden className="size-4 fill-current" />
      </button>
    </div>
  );
}

function Fact({ label }: { label: string }) {
  return (
    <span className="rounded-full border-2 border-border bg-muted px-3.5 py-1.5 text-[13.5px] font-extrabold tabular-nums">
      {label}
    </span>
  );
}

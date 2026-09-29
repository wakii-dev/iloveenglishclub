"use client";

import { Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { accuracyRingDash } from "@/lib/dictation-ui/format";
import { LoginBanner } from "./login-banner";

/**
 * §3.12 ResultsScreen (§5.7): AccuracyRing SVG 128 (r=52, stroke 12, rotate
 * -90°, dasharray pct×326.7) + RewardPills (XP · streak placeholder · words
 * to review từ lastDiff part skipped — spec §3.12) + Try again / Bài tiếp
 * theo (fallback về unit). Guest: banner + XP "chưa lưu".
 */
export function ResultsScreen({
  name,
  eyebrow,
  isGuest,
  accuracy,
  earnedXp,
  done,
  skipped,
  reviewWords,
  nextHref,
  unitHref,
  onTryAgain,
}: Props) {
  const t = useTranslations("lesson");
  const pct = Math.round(accuracy * 100);

  return (
    <div className="mx-auto flex max-w-[820px] flex-col items-start px-6 pb-14 pt-[26px]">
      <span className="inline-flex items-center rounded-full bg-secondary/8 px-[13px] py-[5px] text-[12.5px] font-extrabold uppercase tracking-[0.05em] text-secondary">
        {eyebrow}
      </span>
      <h1 className="mt-3.5 font-display text-[38px] leading-[1.1] font-bold tracking-tight">
        {name
          ? t("dictation.results.titleNamed", { name })
          : t("dictation.results.title")}
      </h1>
      <p className="mb-5 mt-2 text-[17px] font-semibold text-muted-foreground tabular-nums">
        {t("dictation.results.lead", { done, skipped })}
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3.5">
        <div className="relative size-[128px]" role="img"
          aria-label={`${pct}% ${t("dictation.results.accuracy")}`}
        >
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            <circle cx="64" cy="64" r="52" fill="none" stroke="var(--muted)" strokeWidth="12" />
            <circle
              cx="64"
              cy="64"
              r="52"
              fill="none"
              stroke="var(--success)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={accuracyRingDash(accuracy)}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center font-display text-[30px] font-bold tabular-nums">
            {pct}%
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[15px] font-extrabold tabular-nums">
            {t("dictation.results.xpEarned", { xp: earnedXp })}
            {isGuest ? (
              <em className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-extrabold text-muted-foreground not-italic">
                {t("dictation.xp.unsaved")}
              </em>
            ) : null}
          </span>
          <span className="inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-4 py-2 text-[15px] font-extrabold text-muted-foreground">
            <Flame aria-hidden className="size-4 text-[#f97316]" />
            {t("dictation.results.streakPlaceholder")}
          </span>
          {reviewWords.length > 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-muted px-3.5 py-1.5 text-[13px] font-bold">
              {t("dictation.results.wordsToReview", {
                words: reviewWords.join(" · "),
              })}
            </span>
          ) : null}
        </div>
      </div>

      {isGuest ? <LoginBanner className="mb-5" /> : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onTryAgain}
          className="inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-[22px] py-[11px] text-[15px] font-extrabold transition-colors duration-150 hover:border-muted-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
        >
          {t("dictation.results.tryAgain")}
        </button>
        {nextHref ? (
          <LinkButton href={nextHref} primary>
            {t("dictation.results.nextLesson")} →
          </LinkButton>
        ) : (
          <LinkButton href={unitHref} primary>
            {t("dictation.results.backToUnit")} →
          </LinkButton>
        )}
      </div>
    </div>
  );
}

function LinkButton({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-[14px] bg-primary px-[22px] py-[11px] text-[15px] font-extrabold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)]"
          : "inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-[22px] py-[11px] text-[15px] font-extrabold transition-colors duration-150 hover:border-muted-foreground"
      }
    >
      {children}
    </Link>
  );
}

interface Props {
  name: string | null;
  eyebrow: string;
  isGuest: boolean;
  accuracy: number;
  earnedXp: number;
  done: number;
  skipped: number;
  reviewWords: string[];
  nextHref: string | null;
  unitHref: string;
  onTryAgain: () => void;
}

"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { SessionKind } from "@/lib/vocabulary/learn-session";
import type { LevelInfo, SessionSummaryData } from "@/lib/vocabulary/session-state";

/**
 * SessionSummary (SF-3, hand-off §2.2.5): "+XP" Baloo 52 coral · breakdown
 * theo kind (learn: trồng + bước đúng; review: bước đúng) · 3 ô stats bg2
 * (trồng / stage / level|streak) · capnote khi xpCapped · CTA học tiếp
 * (reload — force-dynamic GET lại = phiên mới kế) + ghost về dashboard.
 */
export function SessionSummary({
  summary,
  kind,
  levelInfo,
  streak,
  dashboardHref,
}: {
  summary: SessionSummaryData;
  kind: SessionKind;
  /** learn — stat level + nhãn CTA kế (null → CTA generic). */
  levelInfo: LevelInfo | null;
  streak: number;
  dashboardHref: string;
}) {
  const t = useTranslations("vocabulary.session");
  const tLearn = useTranslations("learn");
  const isLearn = kind === "learn";

  const plantedXp = summary.planted * 4;
  const stepXp = Math.max(0, summary.xpTotal - plantedXp);

  return (
    <div
      data-testid="session-summary"
      className="rounded-[24px] border-[1.5px] border-border bg-card p-6 shadow-[0_10px_30px_rgba(67,40,24,0.08)]"
    >
      <p className="text-center text-[12.5px] font-extrabold uppercase tracking-[0.1em] text-secondary">
        {t("summary.label")}
      </p>
      <p
        data-testid="summary-xp"
        className="text-center font-display text-[52px] leading-[1.15] font-extrabold text-primary tabular-nums"
      >
        {t("summary.xp", { xp: summary.xpTotal })}
      </p>
      <p className="mb-[18px] text-center text-[14px] text-muted-foreground tabular-nums">
        {isLearn
          ? t("summary.learnSub", {
              planted: summary.planted,
              plantedXp,
              stepXp,
            })
          : t("summary.reviewSub", { steps: summary.correctSteps })}
      </p>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-[14px] bg-muted px-1.5 py-3">
          <b
            data-testid="summary-planted"
            className="block font-display text-[19px] font-bold text-leaf-deep tabular-nums"
          >
            {summary.planted}
          </b>
          <span className="text-[12px] leading-[1.3] text-muted-foreground">
            {t("summary.statPlanted")}
          </span>
        </div>
        <div className="rounded-[14px] bg-muted px-1.5 py-3">
          <b className="block font-display text-[19px] font-bold text-leaf-deep">
            {tLearn(`stage.${summary.maxStage}`)}
          </b>
          <span className="text-[12px] leading-[1.3] text-muted-foreground">
            {t("summary.statStage")}
          </span>
        </div>
        <div className="rounded-[14px] bg-muted px-1.5 py-3">
          {isLearn && levelInfo ? (
            <>
              <b
                data-testid="summary-level"
                className="block font-display text-[19px] font-bold text-leaf-deep tabular-nums"
              >
                {/* plantedInChunk chụp lúc page-load (trước phiên) — cộng planted
                    phiên này (từ reps=0 lúc load, không trùng) */}
                {levelInfo.plantedInChunk + summary.planted}/
                {levelInfo.chunkTotal}
              </b>
              <span className="text-[12px] leading-[1.3] text-muted-foreground">
                {t("summary.statLevel", { level: levelInfo.level })}
              </span>
            </>
          ) : (
            <>
              <b className="block font-display text-[19px] font-bold text-leaf-deep tabular-nums">
                {streak}
              </b>
              <span className="text-[12px] leading-[1.3] text-muted-foreground">
                {t("summary.statStreak")}
              </span>
            </>
          )}
        </div>
      </div>

      {summary.xpCapped ? (
        <p
          data-testid="capnote"
          className="mt-3.5 rounded-[10px] bg-muted px-3 py-2 text-center text-[12.5px] text-muted-foreground"
        >
          {t("summary.capnote")}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => window.location.reload()}
        data-testid="summary-next"
        className="mt-[18px] flex min-h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-primary font-display text-[17.5px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none"
      >
        {isLearn
          ? levelInfo
            ? t("summary.nextLevel", { level: levelInfo.level + 1 })
            : t("summary.reviewAgain")
          : t("summary.reviewAgain")}
        <ArrowRight aria-hidden className="size-[18px]" />
      </button>
      <Link
        href={dashboardHref}
        data-testid="summary-dashboard"
        className="mt-2.5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] font-extrabold text-muted-foreground transition-colors hover:bg-accent"
      >
        <RotateCcw aria-hidden className="hidden" />
        {t("summary.dashboard")}
      </Link>
    </div>
  );
}

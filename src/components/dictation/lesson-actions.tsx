"use client";

import { ArrowRight, Check, Lightbulb, SkipForward } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * §3.5 LessonActions: trái Skip + Hint (ghost); phải Check (attempts=0) hoặc
 * "Câu tiếp" (sau check đầu — luôn hiện kể cả còn sai = skip ngầm qua next()).
 * Frozen (review) → disabled toàn bộ. RelaxedToggle KHÔNG ở đây (tabs row).
 */
export function LessonActions({
  attempts,
  frozen,
  canHint,
  onCheck,
  onNext,
  onSkip,
  onHint,
}: Props) {
  const t = useTranslations("lesson");
  const checked = attempts > 0;

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <div className="flex gap-2">
        <GhostButton onClick={onSkip} disabled={frozen} label={t("dictation.actions.skipAria")}>
          <SkipForward aria-hidden className="size-4" />
          {t("dictation.actions.skip")}
        </GhostButton>
        <GhostButton
          onClick={onHint}
          disabled={frozen || !canHint}
          label={t("dictation.actions.hintAria")}
        >
          <Lightbulb aria-hidden className="size-4" />
          {t("dictation.actions.hint")}
        </GhostButton>
      </div>

      {checked ? (
        <PrimaryButton onClick={onNext} disabled={frozen}>
          {t("dictation.actions.next")}
          <ArrowRight aria-hidden className="size-4" />
        </PrimaryButton>
      ) : (
        <PrimaryButton onClick={onCheck} disabled={frozen}>
          {t("dictation.actions.check")}
          <Check aria-hidden className="size-4" />
        </PrimaryButton>
      )}
    </div>
  );
}

function GhostButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex items-center gap-2 rounded-[14px] border-2 border-border bg-card px-[22px] py-[11px] text-[15px] font-extrabold transition-colors duration-150 hover:border-muted-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-[14px] bg-primary px-[22px] py-[11px] text-[15px] font-extrabold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 active:translate-y-[3px] active:shadow-[0_1px_0_var(--primary-deep)] disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

interface Props {
  attempts: number;
  frozen: boolean;
  canHint: boolean;
  onCheck: () => void;
  onNext: () => void;
  onSkip: () => void;
  onHint: () => void;
}

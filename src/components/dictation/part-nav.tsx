"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * §3.9 PartNav (§5.6): ‹ prevPart() review; › THUẦN ĐIỀU HƯỚNG — chỉ enabled
 * khi part hiện tại RESOLVED (không resolve ngầm part pending — resolve chỉ
 * qua "Câu tiếp"/Skip). Part chưa xong không nhảy tới (sequential).
 */
export function PartNav({
  current,
  total,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: Props) {
  const t = useTranslations("lesson");

  return (
    <div className="mt-3 flex items-center justify-center gap-4 text-[14px] font-extrabold text-muted-foreground tabular-nums">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={t("dictation.partNav.prev")}
        className="grid size-[38px] place-items-center rounded-full border-2 border-border bg-card text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft aria-hidden className="size-4" strokeWidth={2.4} />
      </button>
      <span>
        {t("dictation.partNav.label", { current, total })}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label={t("dictation.partNav.next")}
        className="grid size-[38px] place-items-center rounded-full border-2 border-border bg-card text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight aria-hidden className="size-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

interface Props {
  current: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

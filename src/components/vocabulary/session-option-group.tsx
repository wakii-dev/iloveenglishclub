"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

/**
 * Nhóm lựa chọn MC/listen (SF-3) — radio-group pattern ARIA: roving tabindex
 * + Arrow/Home/End di focus, Enter/Space chọn (context pack #3 "keyboard
 * operable"). Touch ≥44 (option 52px — hand-off §3). Sau chấm: cả group
 * disable; option được chọn tô leaf/red — payload không có đáp án nên KHÔNG
 * tự biết tô option đúng khi chọn sai (contract SF-2 no-leak).
 */
export function SessionOptionGroup({
  options,
  groupLabel,
  chosen,
  chosenCorrect,
  disabled,
  onAnswer,
}: {
  options: string[];
  groupLabel: string;
  /** Response đã chấm (tô option) — null khi chưa chấm. */
  chosen: string | null;
  chosenCorrect: boolean;
  disabled: boolean;
  onAnswer: (response: string) => void;
}) {
  const [focusIndex, setFocusIndex] = useState(0);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = focusIndex >= last ? 0 : focusIndex + 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = focusIndex <= 0 ? last : focusIndex - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = last;
    }
    if (next !== null) {
      event.preventDefault();
      setFocusIndex(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='radio']")[next]?.focus();
    }
  }

  const locked = disabled || chosen !== null;

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      onKeyDown={onKeyDown}
      data-testid="option-group"
      className="grid gap-2.5"
    >
      {options.map((option, index) => {
        const isChosen = chosen === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isChosen}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={locked}
            onClick={() => onAnswer(option)}
            data-testid="session-option"
            className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-[16px] border-[1.5px] px-4 py-2.5 text-left text-[16px] font-bold transition-colors ${
              isChosen && chosenCorrect
                ? "border-leaf-deep bg-leaf-soft text-leaf-deep"
                : isChosen
                  ? "border-red bg-red-soft text-red"
                  : "border-border bg-card hover:bg-accent"
            } disabled:cursor-default`}
          >
            <span
              className={`grid size-[26px] shrink-0 place-items-center rounded-[8px] text-[12.5px] font-extrabold ${
                isChosen && chosenCorrect
                  ? "bg-leaf-deep text-white"
                  : isChosen
                    ? "bg-red text-white"
                    : "bg-muted text-muted-foreground"
              }`}
              aria-hidden
            >
              {"ABCDEFGH"[index]}
            </span>
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Banner feedback aria-live — đúng leaf + chip "+XP" (khi có), sai red. */
export function SessionFeedback({
  correct,
  xpAwarded,
  children,
}: {
  correct: boolean;
  xpAwarded: number;
  children: string;
}) {
  const ts = useTranslations("vocabulary.session");
  return (
    <div aria-live="polite">
      <div
        role="status"
        data-testid={correct ? "feedback-correct" : "feedback-wrong"}
        className={`mt-3 flex min-h-[48px] items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[14.5px] font-extrabold ${
          correct ? "bg-leaf-soft text-leaf-deep" : "bg-red-soft text-red"
        }`}
      >
        {correct ? (
          <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
            <path
              d="M4 12.5 9.5 18 20 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        )}
        {children}
        {correct && xpAwarded > 0 ? (
          <span className="ml-auto rounded-full bg-card px-2.5 py-0.5 text-[12.5px] text-leaf-deep tabular-nums">
            {ts("feedback.xp", { xp: xpAwarded })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

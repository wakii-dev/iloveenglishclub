"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { normalizeAnswer, type SessionStep } from "@/lib/vocabulary/learn-session";
import type { StepFeedback } from "@/lib/vocabulary/session-state";
import { SessionFeedback } from "./session-option-group";

/**
 * TypeStep (SF-3, hand-off §2.2.4): prompt = nghĩa VI trong ngoặc kép Baloo 26
 * · input + "Kiểm tra" + Enter submit (autocapitalize=off spellcheck=false —
 * pack #5) · 3 trạng thái: đúng (echo từ khi payload đã lộ ở introduce/mc —
 * seenWords) / gần đúng (typo ≤1 từ ≥5 ký tự server chấp nhận — client SOI
 * normalize vs seenWord) / sai → banner đỏ; nút "Tiếp tục" sau sai do RUNNER
 * render chung mọi step kind.
 * Word bị ẨN trong payload type — không seenWord (review listen-first) →
 * feedback đúng KHÔNG echo.
 */
export function TypeStep({
  step,
  feedback,
  seenWord,
  submitting,
  onAnswer,
}: {
  step: SessionStep;
  feedback: StepFeedback | null;
  /** Word đã lộ hợp lệ ở bước trước (introduce/mc) — echo + near-detect. */
  seenWord?: string;
  submitting: boolean;
  onAnswer: (response: string) => void;
}) {
  const t = useTranslations("vocabulary.session");
  const [typed, setTyped] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!typed.trim() || submitting || feedback) return;
    onAnswer(typed);
  }

  const activeFeedback =
    feedback?.step.stepIndex === step.stepIndex ? feedback : null;
  const near =
    activeFeedback != null &&
    activeFeedback.result.correct &&
    seenWord !== undefined &&
    normalizeAnswer(activeFeedback.response) !== normalizeAnswer(seenWord);

  return (
    <div>
      <p className="mb-3 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
        {t("type.label")}
      </p>
      <p className="mb-4 font-display text-[26px] font-bold">
        “{step.meaningVi}”
      </p>

      <form onSubmit={submit} className="flex gap-2.5">
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={t("type.placeholder")}
          aria-label={t("type.inputAria", { meaning: step.meaningVi ?? "" })}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-testid="type-input"
          disabled={submitting || activeFeedback != null}
          className="min-h-[52px] min-w-0 flex-1 rounded-[16px] border-[1.5px] border-input bg-card px-4 py-2.5 text-[16.5px] font-bold placeholder:font-semibold placeholder:text-dim focus-visible:outline-[3px] focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!typed.trim() || submitting || activeFeedback != null}
          data-testid="type-check"
          className="min-h-[52px] cursor-pointer rounded-[16px] bg-primary px-5 text-[16px] font-bold whitespace-nowrap text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("type.check")}
        </button>
      </form>

      {activeFeedback ? (
        <div>
          <SessionFeedback
            correct={activeFeedback.result.correct}
            xpAwarded={activeFeedback.result.xpAwarded}
          >
            {activeFeedback.result.correct
              ? near
                ? t("feedback.near")
                : t("feedback.correct")
              : t("feedback.wrong")}
          </SessionFeedback>
          {activeFeedback.result.correct && seenWord ? (
            <p className="mt-1.5 text-center text-[14px] font-bold text-leaf-deep">
              — “{seenWord}” —
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause } from "lucide-react";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";
import type { SessionStep } from "@/lib/vocabulary/learn-session";
import type { StepFeedback } from "@/lib/vocabulary/session-state";
import { SessionFeedback, SessionOptionGroup } from "./session-option-group";

/**
 * McStep (SF-3, hand-off §2.2.2): qlabel uppercase · từ Baloo + IPA +
 * miniaudio teal (audioUrl null → ẩn) · options từ step.options (pool <4 →
 * render đúng số) · chọn → POST chấm → tô leaf/red + feedback aria-live.
 * Nhìn TỪ chọn NGHĨA — payload mc có word/ipa (contract learn-session.ts).
 */
export function McStep({
  step,
  feedback,
  submitting,
  onAnswer,
}: {
  step: SessionStep;
  feedback: StepFeedback | null;
  submitting: boolean;
  onAnswer: (response: string) => void;
}) {
  const t = useTranslations("vocabulary");
  const ts = useTranslations("vocabulary.session");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggleAudio() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.currentTime = 0;
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false));
  }

  return (
    <div>
      <p className="mb-3 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
        {ts("mc.label")}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[38px] leading-[1.1] font-bold">
          {step.word}
        </h2>
        {step.ipa ? (
          <span className="text-[15px] text-muted-foreground">
            /{step.ipa}/
          </span>
        ) : null}
        {step.audioUrl ? (
          <>
            <button
              type="button"
              onClick={toggleAudio}
              aria-label={
                playing ? t("stop") : t("play", { word: step.word ?? "" })
              }
              className="grid size-[40px] cursor-pointer place-items-center rounded-full bg-teal-soft text-secondary transition-colors hover:bg-accent"
            >
              {playing ? (
                <Pause aria-hidden className="size-[17px]" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-[17px]" aria-hidden>
                  <path
                    d="M3 9v6h4l5 4V5L7 9H3z"
                    fill="currentColor"
                    stroke="none"
                  />
                  <path
                    d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            <audio
              ref={audioRef}
              src={resolveStoredAudioUrl(step.audioUrl)}
              preload="none"
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          </>
        ) : null}
      </div>

      <SessionOptionGroup
        options={step.options ?? []}
        groupLabel={ts("mc.group")}
        chosen={feedback?.step.stepIndex === step.stepIndex ? (feedback?.response ?? null) : null}
        chosenCorrect={feedback?.result.correct ?? false}
        disabled={submitting}
        onAnswer={onAnswer}
      />

      {feedback && feedback.step.stepIndex === step.stepIndex ? (
        <SessionFeedback
          correct={feedback.result.correct}
          xpAwarded={feedback.result.xpAwarded}
        >
          {feedback.result.correct ? ts("feedback.correct") : ts("feedback.wrong")}
        </SessionFeedback>
      ) : null}
    </div>
  );
}

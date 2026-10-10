"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Pause } from "lucide-react";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";
import type { SessionStep } from "@/lib/vocabulary/learn-session";
import type { StepFeedback } from "@/lib/vocabulary/session-state";
import { SessionFeedback, SessionOptionGroup } from "./session-option-group";

/**
 * ListenStep (SF-3, hand-off §2.2.3): nút phát lại teal 58px + waveform
 * (aria-hidden) · options NHƯ MC (chọn nghĩa vừa nghe — engine buildSteps
 * truyền options nghĩa) · KHÔNG word/ipa (nghe-chọn không nhìn chữ — no-leak
 * pin). options: undefined là CONTRACT khi pool <2 nghĩa (pin learn-session
 * test 260) → fallback GÕ NGHĨA (gradeStep listen so meaningVi).
 */
const WAVE_BARS = [
  { h: 12, dim: true },
  { h: 22, dim: false },
  { h: 30, dim: false },
  { h: 16, dim: true },
  { h: 26, dim: false },
  { h: 10, dim: true },
  { h: 20, dim: false },
  { h: 14, dim: true },
] as const;

export function ListenStep({
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
  const [typed, setTyped] = useState("");

  function replay() {
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

  function submitTyped(event: FormEvent) {
    event.preventDefault();
    if (!typed.trim() || submitting || feedback) return;
    onAnswer(typed);
  }

  const activeFeedback = feedback?.step.stepIndex === step.stepIndex ? feedback : null;
  const hasOptions = (step.options?.length ?? 0) >= 2;

  return (
    <div>
      <p className="mb-3 text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
        {hasOptions ? ts("listen.label") : ts("listen.fallbackLabel")}
      </p>

      <div className="mb-4 flex items-center gap-4">
        <button
          type="button"
          onClick={replay}
          aria-label={playing ? t("stop") : ts("listen.replay")}
          data-testid="listen-replay"
          className="grid size-[58px] shrink-0 cursor-pointer place-items-center rounded-[16px] bg-secondary text-secondary-foreground shadow-[0_3px_0_var(--teal-deep)] transition-transform active:translate-y-[2px] active:shadow-none"
        >
          {playing ? (
            <Pause aria-hidden className="size-6" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" stroke="none" />
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
        <div
          aria-hidden
          className="flex h-[34px] items-center gap-[3px]"
          data-testid="listen-wave"
        >
          {WAVE_BARS.map((bar, index) => (
            <i
              key={index}
              style={{ height: `${bar.h}px` }}
              className={`w-1 rounded-sm ${bar.dim ? "bg-wave-dim" : "bg-secondary"}`}
            />
          ))}
        </div>
      </div>
      <audio
        ref={audioRef}
        src={resolveStoredAudioUrl(step.audioUrl ?? "")}
        preload="none"
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      {hasOptions ? (
        <SessionOptionGroup
          options={step.options ?? []}
          groupLabel={ts("listen.group")}
          chosen={activeFeedback?.response ?? null}
          chosenCorrect={activeFeedback?.result.correct ?? false}
          disabled={submitting}
          onAnswer={onAnswer}
        />
      ) : (
        <form onSubmit={submitTyped} className="flex gap-2.5">
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={ts("listen.fallbackPlaceholder")}
            aria-label={ts("listen.fallbackLabel")}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-testid="listen-fallback-input"
            disabled={submitting || activeFeedback != null}
            className="min-h-[52px] min-w-0 flex-1 rounded-[16px] border-[1.5px] border-input bg-card px-4 py-2.5 text-[16.5px] font-bold placeholder:font-semibold placeholder:text-dim focus-visible:outline-[3px] focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!typed.trim() || submitting || activeFeedback != null}
            className="min-h-[52px] cursor-pointer rounded-[16px] bg-primary px-5 text-[16px] font-bold whitespace-nowrap text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ts("listen.fallbackCheck")}
          </button>
        </form>
      )}

      {activeFeedback ? (
        <SessionFeedback
          correct={activeFeedback.result.correct}
          xpAwarded={activeFeedback.result.xpAwarded}
        >
          {activeFeedback.result.correct
            ? ts("feedback.correct")
            : ts("feedback.wrong")}
        </SessionFeedback>
      ) : null}
    </div>
  );
}

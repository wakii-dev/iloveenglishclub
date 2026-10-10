"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Pause } from "lucide-react";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";
import type { SessionStep } from "@/lib/vocabulary/learn-session";

/**
 * IntroduceCard (SF-3, hand-off §2.2.1): chip stage "Hạt mầm" + badge số bước
 * kiểm tra · từ Baloo 38 + IPA · nút nghe coral pill (ẨN khi audioUrl null —
 * pattern WordPlayButton/resolveStoredAudioUrl) · nghĩa VI đậm · ví dụ khối
 * bg2 · CTA "Tiếp tục". Introduce KHÔNG POST — advance thuần.
 * Stage luôn 0 (chỉ từ reps=0 mới vào learn queue — growth.ts boundary).
 */
export function IntroduceCard({
  step,
  testSteps,
  onContinue,
}: {
  step: SessionStep;
  testSteps: number;
  onContinue: () => void;
}) {
  const t = useTranslations("vocabulary");
  const ts = useTranslations("vocabulary.session");
  const tLearn = useTranslations("learn");
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
      .catch(() => setPlaying(false)); // autoplay chặn / mạng lỗi — fail mềm
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-3 py-1.5 text-[13px] font-extrabold text-leaf-deep">
          <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden>
            <circle cx="12" cy="15" r="3.4" fill="currentColor" />
          </svg>
          {tLearn("stage.0")}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-1.5 text-[13px] font-bold text-muted-foreground">
          {ts("introduce.badge", { count: testSteps })}
        </span>
      </div>

      <h2 className="font-display text-[38px] leading-[1.1] font-bold">
        {step.word}
      </h2>
      {step.ipa ? (
        <p className="mt-1 text-[15px] text-muted-foreground">/{step.ipa}/</p>
      ) : null}

      {step.audioUrl ? (
        <button
          type="button"
          onClick={toggleAudio}
          aria-label={playing ? t("stop") : t("play", { word: step.word ?? "" })}
          className="mt-3.5 inline-flex min-h-[56px] cursor-pointer items-center gap-2.5 rounded-full bg-primary px-[22px] font-display text-[17px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none"
        >
          {playing ? (
            <Pause aria-hidden className="size-5" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
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
          {ts("introduce.listenCta")}
        </button>
      ) : null}
      {step.audioUrl ? (
        <audio
          ref={audioRef}
          src={resolveStoredAudioUrl(step.audioUrl)}
          preload="none"
          onEnded={() => setPlaying(false)}
          className="hidden"
        />
      ) : null}

      <p className="mt-3.5 text-[17.5px] font-bold">{step.meaningVi}</p>
      {step.example ? (
        <div className="mt-3 rounded-[14px] bg-muted p-3.5 text-[14.5px]">
          {step.example}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onContinue}
        data-testid="introduce-continue"
        className="mt-[18px] flex min-h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-primary font-display text-[17.5px] font-bold text-primary-foreground shadow-[0_4px_0_var(--primary-deep)] transition-transform active:translate-y-[3px] active:shadow-none"
      >
        {ts("introduce.continue")}
        <ArrowRight aria-hidden className="size-[18px]" />
      </button>
    </div>
  );
}

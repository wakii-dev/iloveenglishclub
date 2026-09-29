"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatTime, waveformFillCount } from "@/lib/dictation-ui/format";

/**
 * §3.2 DictationPlayer (design §2.2 + hand-off §1.9): pill — play 52px shadow
 * đặc · waveform 28 bar (height pattern cố định, fill = elapsed/duration) ·
 * time `m:ss / m:ss` tabular-nums · speed pill teal. Click waveform = seek
 * theo tỉ lệ; ±3s qua shortcut (orchestrator). Audio element KHÔNG ở đây —
 * orchestrator sync effect duy nhất (component chỉ render + callback).
 */

// hand-off §1.9 — 28 giá trị % theo đúng thứ tự prototype
const WAVE_HEIGHTS = [
  22, 40, 64, 38, 80, 52, 30, 58, 88, 44, 26, 60, 74, 36,
  48, 70, 32, 56, 84, 40, 24, 62, 46, 34, 66, 28, 52, 38,
] as const;

function speedLabel(speed: number): string {
  return `${speed}x`;
}

export function DictationPlayer({
  isPlaying,
  ended,
  elapsedMs,
  durationMs,
  speed,
  disabled,
  onPlayPause,
  onSeekMs,
  onSpeedCycle,
}: Props) {
  const t = useTranslations("lesson");
  const durSec = durationMs != null && durationMs > 0 ? durationMs / 1000 : 0;
  const filled = waveformFillCount(elapsedMs, durSec * 1000);

  if (disabled) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-2 border-border bg-muted px-4 py-3 text-[13px] font-bold text-muted-foreground"
        role="note"
      >
        {t("dictation.player.noAudio")}
      </div>
    );
  }

  const label = ended
    ? t("dictation.player.replay")
    : isPlaying
      ? t("dictation.player.pause")
      : t("dictation.player.play");

  return (
    <div className="flex items-center gap-3.5 rounded-full border-2 border-border bg-muted px-3.5 py-2.5">
      <button
        type="button"
        onClick={onPlayPause}
        aria-label={label}
        title={label}
        className="grid size-[52px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-deep)] transition-[transform,box-shadow] duration-[80ms] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 active:translate-y-[2px] active:shadow-[0_1px_0_var(--primary-deep)]"
      >
        {ended ? (
          <RotateCcw aria-hidden className="size-[18px]" />
        ) : isPlaying ? (
          <Pause aria-hidden className="size-[18px] fill-current" />
        ) : (
          <Play aria-hidden className="size-[18px] fill-current" />
        )}
      </button>

      <div
        role="slider"
        aria-label={t("dictation.player.play")}
        aria-valuemin={0}
        aria-valuemax={Math.round(durSec)}
        aria-valuenow={Math.round(elapsedMs / 1000)}
        tabIndex={-1}
        onClick={(e) => {
          if (durSec <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          onSeekMs(ratio * durSec * 1000);
        }}
        className="flex h-[38px] min-w-0 flex-1 cursor-pointer items-center gap-[3px] overflow-hidden"
      >
        {WAVE_HEIGHTS.map((h, i) => (
          <i
            key={i}
            aria-hidden
            style={{ height: `${h}%` }}
            className={
              i < filled
                ? "max-w-[6px] flex-1 rounded-[3px] bg-secondary"
                : "max-w-[6px] flex-1 rounded-[3px] bg-border"
            }
          />
        ))}
      </div>

      <span className="whitespace-nowrap text-[13.5px] font-extrabold text-muted-foreground tabular-nums">
        {formatTime(elapsedMs / 1000)} / {formatTime(durSec)}
      </span>

      <button
        type="button"
        onClick={onSpeedCycle}
        aria-label={t("dictation.player.speed", { speed })}
        className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-[13px] font-extrabold text-secondary tabular-nums transition-colors duration-150 hover:border-secondary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        {speedLabel(speed)}
      </button>
    </div>
  );
}

interface Props {
  isPlaying: boolean;
  ended: boolean;
  elapsedMs: number;
  durationMs: number | null;
  speed: number;
  disabled: boolean;
  onPlayPause: () => void;
  onSeekMs: (ms: number) => void;
  onSpeedCycle: () => void;
}

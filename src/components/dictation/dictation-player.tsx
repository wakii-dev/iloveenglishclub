"use client";

interface Props {
  isPlaying: boolean;
  ended: boolean;
  elapsedMs: number;
  durationMs: number | null;
  speed: number;
  disabled: boolean;
  onPlayPause: () => void;
  onReplay: () => void;
  onSeekMs: (ms: number) => void;
  onSpeedCycle: () => void;
}

/** STUB T1 → FULL T2: pill player 52px + waveform 28 bar + time + speed. */
export const DictationPlayer: React.FC<Props> = () => (
  <div className="rounded-full border-2 border-border bg-muted p-3 text-center text-[13px] font-bold text-muted-foreground">
    [player — T2]
  </div>
);

"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PartStatus } from "@/lib/dictation/store";
import { dictationStore } from "@/lib/dictation/store";
import { WordLookupText } from "@/components/vocabulary/word-lookup";
import { cn } from "cn";

/**
 * §3.10 TranscriptTab (§5.9): toàn bộ text + audio player tổng (Play all —
 * queue tuần tự, element RIÊNG không đụng player chính; pause main player
 * trước khi phát). Part pending → blur + aria-hidden + lock-note (prototype).
 * SF-5: text click-lookup (WordLookupText) — câu khoá giữ text thuần.
 */
export function TranscriptTab({
  sentences,
  audioUrls,
  bookId,
}: Props) {
  const t = useTranslations("lesson");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  // dừng play-all khi rời tab/unmount
  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlayingIdx(null);
  };

  const playFrom = (idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    dictationStore.getState().pause(); // main player im khi play-all
    const url = audioUrls[idx];
    if (!url) return;
    audio.src = url;
    audio.play().catch(() => {});
    setPlayingIdx(idx);
  };

  const all = playingIdx !== null;

  return (
    <div className="rounded-[24px] border-2 border-border bg-card p-[26px] pb-6 shadow-[0_10px_30px_-18px_color-mix(in_srgb,var(--primary-deep)_35%,transparent)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold">
          {t("dictation.transcript.title")}
        </h2>
        {all ? (
          <GhostPill onClick={stop} label={t("dictation.transcript.stop")}>
            <Pause aria-hidden className="size-3.5 fill-current" />
            {t("dictation.transcript.stop")}
          </GhostPill>
        ) : (
          <GhostPill onClick={() => playFrom(0)} label={t("dictation.transcript.playAll")}>
            <Play aria-hidden className="size-3.5 fill-current" />
            {t("dictation.transcript.playAll")}
          </GhostPill>
        )}
      </div>

      <ul
        aria-label={t("dictation.transcript.title")}
        className="m-0 mt-4 list-none p-0"
      >
        {sentences.map((s, i) => {
          const locked = s.status === "pending";
          const current = playingIdx === i;
          return (
            <li
              key={i}
              aria-hidden={locked || undefined}
              className={cn(
                "border-b-2 border-dashed border-border px-1 py-[13px] text-[16px] font-semibold",
                locked && "select-none text-muted-foreground blur-[4px]",
                current && "text-primary",
              )}
            >
              <span className="mr-2.5 text-[13.5px] font-extrabold text-secondary tabular-nums">
                {i + 1}
              </span>
              <WordLookupText text={s.text} bookId={bookId} disabled={locked} />
            </li>
          );
        })}
      </ul>

      <p className="mt-3.5 flex items-center gap-2 text-[13.5px] font-bold text-muted-foreground">
        <Lock aria-hidden className="size-3.5" />
        {t("dictation.transcript.locked")}
      </p>

      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => {
          const next = (playingIdx ?? 0) + 1;
          if (next < sentences.length && audioUrls[next]) {
            playFrom(next);
          } else {
            setPlayingIdx(null);
          }
        }}
        className="hidden"
      />
    </div>
  );
}

function GhostPill({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-4 py-1.5 text-[13px] font-extrabold text-secondary transition-colors duration-150 hover:border-secondary focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
    >
      {children}
    </button>
  );
}

interface Props {
  sentences: readonly { text: string; status: PartStatus }[];
  audioUrls: readonly (string | null)[];
  bookId: number;
}

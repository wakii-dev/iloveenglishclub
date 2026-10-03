"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { resolveStoredAudioUrl } from "@/lib/admin/vocabulary";

/**
 * Nút phát âm của 1 từ (SF-2 t-2.2) — <audio> thuần, không thư viện mới.
 * ẨN khi audioUrl null (page không render); badge vuông 46px cùng ngôn ngữ
 * hình học với UnitRow (bg-muted rounded-[14px]). resolveStoredAudioUrl tái
 * dùng leg SF-1 (blob CDN nguyên / local thêm /).
 */
export function WordPlayButton({
  word,
  audioUrl,
}: {
  word: string;
  audioUrl: string;
}) {
  const t = useTranslations("vocabulary");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
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
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t("stop") : t("play", { word })}
        className="flex size-[46px] shrink-0 cursor-pointer items-center justify-center rounded-[14px] bg-muted text-secondary transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
      >
        {playing ? (
          <Pause aria-hidden className="size-4" />
        ) : (
          <Play aria-hidden className="size-4" />
        )}
      </button>
      <audio
        ref={audioRef}
        src={resolveStoredAudioUrl(audioUrl)}
        preload="none"
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </>
  );
}

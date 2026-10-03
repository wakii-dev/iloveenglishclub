"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Undo2 } from "lucide-react";
import { WordPlayButton } from "@/components/content/word-play-button";
import type { DueWord } from "@/lib/vocabulary/review-store";

/**
 * Flashcard lật + chấm quality (SF-3 t-3.2) — client thuần, state local
 * (không store mới). Lật 3D CSS (rotateY, Tailwind v4 rotate-y-utility +
 * arbitrary transform-style); mặt ẩn inert + aria-hidden để SR/skip focus.
 * "Lại" (q=0) đẩy thẻ xuống cuối hàng ôn lại trong phiên; grade khác đi tiếp.
 * POST lỗi → giữ thẻ + báo lỗi mềm (đã flip lại mặt trước).
 */

const GRADES = [
  { quality: 0, labelKey: "gradeAgain", fail: true },
  { quality: 3, labelKey: "gradeHard", fail: false },
  { quality: 4, labelKey: "gradeGood", fail: false },
  { quality: 5, labelKey: "gradeEasy", fail: false },
] as const;

export function ReviewFlashcards({
  words,
  prefill = null,
}: {
  words: DueWord[];
  /** Thẻ "Học từ này" (SF-2 tab Thư viện) — đẩy đầu hàng, không nhân nếu trùng. */
  prefill?: DueWord | null;
}) {
  const t = useTranslations("vocabulary");
  const [queue, setQueue] = useState<DueWord[]>(() =>
    prefill && !words.some((w) => w.wordId === prefill.wordId)
      ? [prefill, ...words]
      : words,
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const current = queue[index];
  const done = current === undefined;

  async function grade(quality: number, fail: boolean) {
    if (!current || pending) return;
    setPending(true);
    setSaveError(false);
    try {
      const res = await fetch("/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: current.wordId, quality }),
      });
      if (!res.ok) throw new Error(`review POST ${res.status}`);
    } catch {
      setPending(false);
      setSaveError(true);
      return;
    }
    setPending(false);
    setFlipped(false);
    setIndex((i) => i + 1);
    if (fail) setQueue((q) => [...q, current]);
  }

  if (done) {
    return (
      <p className="rounded-[18px] border-2 border-dashed border-border bg-card p-6 text-center text-[14px] font-semibold text-muted-foreground">
        {t("reviewDone")}
      </p>
    );
  }

  return (
    <div>
      <p className="text-[13.5px] font-bold text-muted-foreground tabular-nums">
        {t("cardProgress", { current: index + 1, total: queue.length })}
      </p>

      {/* [perspective] cho lật 3D; mặt sau xoay sẵn 180° */}
      <div className="mt-3 [perspective:1200px]">
        <div
          className={`relative h-[320px] w-full transition-transform duration-300 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Mặt trước: từ — bấm để lật */}
          <div
            inert={flipped}
            aria-hidden={flipped}
            className="absolute inset-0 [backface-visibility:hidden]"
          >
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-[18px] border-2 border-border bg-card p-6 text-center transition-colors duration-150 hover:border-ring focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <span className="font-display text-[34px] leading-tight font-bold tracking-tight">
                {current.word}
              </span>
              <span className="text-[13.5px] font-semibold text-muted-foreground">
                {t("flipHint")}
              </span>
            </button>
          </div>

          {/* Mặt sau: nghĩa + IPA + audio + chấm quality */}
          <div
            inert={!flipped}
            aria-hidden={!flipped}
            className="absolute inset-0 flex flex-col rounded-[18px] border-2 border-border bg-card p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            <button
              type="button"
              onClick={() => setFlipped(false)}
              aria-label={t("flipBack")}
              className="absolute top-3.5 right-3.5 flex size-9 cursor-pointer items-center justify-center rounded-[14px] bg-muted text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              <Undo2 aria-hidden className="size-4" />
            </button>

            <div className="flex min-h-0 flex-1 items-center justify-center gap-3 text-center">
              {current.audioUrl ? (
                <WordPlayButton word={current.word} audioUrl={current.audioUrl} />
              ) : null}
              <span>
                <span className="block font-display text-[26px] leading-tight font-bold tracking-tight">
                  {current.word}
                </span>
                {current.ipa ? (
                  <span className="mt-1 block text-[14px] font-semibold text-muted-foreground">
                    /{current.ipa}/
                  </span>
                ) : null}
                <span className="mt-2 block text-[16px] font-bold">
                  {current.meaningVi}
                </span>
                {current.example ? (
                  <span className="mt-1 block text-[13.5px] text-muted-foreground italic">
                    {current.example}
                  </span>
                ) : null}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={t("gradeGroup")}>
              {GRADES.map((g) => (
                <button
                  key={g.quality}
                  type="button"
                  disabled={pending}
                  onClick={() => grade(g.quality, g.fail)}
                  className={`cursor-pointer rounded-[14px] border-2 px-2 py-2.5 text-[13.5px] font-bold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                    g.fail
                      ? "border-border bg-muted text-secondary hover:bg-accent hover:text-accent-foreground"
                      : "border-border bg-card hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {t(g.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {saveError ? (
        <p role="alert" className="mt-3 text-[13.5px] font-semibold text-destructive">
          {t("reviewError")}
        </p>
      ) : null}
    </div>
  );
}

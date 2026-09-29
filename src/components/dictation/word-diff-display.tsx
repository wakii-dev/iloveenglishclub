"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DiffResult, DiffWord } from "@/lib/dictation/diff";
import { cn } from "cn";

/**
 * §3.4 WordDiffDisplay (design §2.2 token spec): matched → tint success;
 * wrong → tint destructive + line-through + chip từ đúng absolute -top-6;
 * missing → thân "—" + chip; extra → không chip. Diff PERSIST trong lúc sửa
 * (spec-critic P1). Banner "Chính xác!" khi allCorrect; diff-note theo mode.
 */
export function WordDiffDisplay({ diff, relaxed }: Props) {
  const t = useTranslations("lesson");

  return (
    <div className="mt-4" aria-live="polite">
      {diff.allCorrect ? (
        <p className="mb-3 flex items-center gap-2 rounded-[16px] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-4 py-3 text-[15px] font-extrabold text-success">
          <CheckCircle2 aria-hidden className="size-5" />
          {t("dictation.diff.correct")}
        </p>
      ) : null}

      {diff.words.length > 0 ? (
        <p className="max-w-[60ch] text-[20px] leading-[2.1] font-semibold">
          {diff.words.map((w, i) => (
            <Word key={i} word={w} />
          ))}
        </p>
      ) : null}

      <p className="mt-3 text-[13.5px] font-semibold text-muted-foreground">
        {relaxed
          ? t("dictation.diff.noteRelaxed")
          : t("dictation.diff.noteStrict")}
      </p>
    </div>
  );
}

function Word({ word }: { word: DiffWord }) {
  if (word.status === "matched") {
    return (
      <span className="mx-[2px] my-[3px] inline-block rounded-xl bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-[9px] py-[2px] text-success">
        {word.typedToken}
      </span>
    );
  }
  // wrong | missing | extra — đỏ gạch; chip từ đúng chỉ khi có transcriptToken
  return (
    <span
      className={cn(
        "relative mx-[2px] my-[3px] inline-block rounded-xl px-[9px] py-[2px] text-destructive line-through",
        "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)]",
      )}
    >
      {word.typedToken ?? "—"}
      {word.transcriptToken ? (
        <i className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-success px-2.5 py-0.5 text-[12.5px] font-extrabold text-success-foreground not-italic line-through no-underline whitespace-nowrap">
          {word.transcriptToken}
        </i>
      ) : null}
    </span>
  );
}

interface Props {
  diff: DiffResult;
  relaxed: boolean;
}

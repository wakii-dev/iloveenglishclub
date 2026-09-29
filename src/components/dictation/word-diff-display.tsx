"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DiffResult, DiffWord } from "@/lib/dictation/diff";
import { cn } from "cn";

/**
 * §3.4 WordDiffDisplay (design §2.2 token spec): matched → tint success;
 * wrong → tint destructive + line-through + chip từ đúng absolute; missing →
 * thân "—" + chip; extra → không chip. Diff PERSIST trong lúc sửa (spec-critic
 * P1). Banner "Chính xác!" khi allCorrect; diff-note theo mode.
 *
 * Fix overlay (user 2026-09-29): chip -top-6 của các từ sai LIÊN TIẾP chồng
 * nhau + dòng đầu tràn lên đè khu vực phía trên → (1) container có pt-14
 * làm headroom 2 tầng chip, (2) chip so le 2 tầng theo index từ sai, (3) chip
 * max-width + truncate, (4) z-10 nổi trên token.
 */
export function WordDiffDisplay({ diff, relaxed }: Props) {
  const t = useTranslations("lesson");
  let wrongIndex = -1;

  return (
    <div className="mt-4" aria-live="polite">
      {diff.allCorrect ? (
        <p className="mb-3 flex items-center gap-2 rounded-[16px] bg-[color-mix(in_srgb,var(--success)_14%,transparent)] px-4 py-3 text-[15px] font-extrabold text-success">
          <CheckCircle2 aria-hidden className="size-5" />
          {t("dictation.diff.correct")}
        </p>
      ) : null}

      {diff.words.length > 0 ? (
        <p className="max-w-[60ch] pt-14 text-[20px] leading-[2.1] font-semibold">
          {diff.words.map((w, i) => {
            if (w.status !== "matched") wrongIndex += 1;
            return <Word key={i} word={w} wrongIndex={wrongIndex} />;
          })}
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

function Word({ word, wrongIndex }: { word: DiffWord; wrongIndex: number }) {
  if (word.status === "matched") {
    return (
      <span className="mx-[2px] my-[3px] inline-block rounded-xl bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-[9px] py-[2px] text-success">
        {word.typedToken}
      </span>
    );
  }
  // wrong | missing | extra — đỏ gạch; chip từ đúng chỉ khi có transcriptToken.
  // Chip so le 2 tầng (-top-6 / -top-[3.5rem]) theo thứ tự từ sai để chip liền
  // kề không đè nhau khi nhiều từ sai liên tiếp.
  const chipRow = wrongIndex % 2;
  return (
    <span
      className={cn(
        "relative mx-[2px] my-[3px] inline-block rounded-xl px-[9px] py-[2px] text-destructive line-through",
        "bg-[color-mix(in_srgb,var(--destructive)_14%,transparent)]",
      )}
    >
      {word.typedToken ?? "—"}
      {word.transcriptToken ? (
        <i
          className={cn(
            "absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-success px-2.5 py-0.5 text-[12.5px] font-extrabold text-success-foreground not-italic line-through no-underline whitespace-nowrap",
            chipRow === 0 ? "-top-6" : "-top-[3.6rem]",
            "max-w-[160px] overflow-hidden text-ellipsis",
          )}
        >
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

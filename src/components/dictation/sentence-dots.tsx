"use client";

import { useTranslations } from "next-intl";
import type { PartStatus } from "@/lib/dictation/store";
import { cn } from "cn";

/** SentenceDots (design §1.9): done=success · current=primary + ring-4 ring ·
 *  todo=border. Dots aria-hidden — label text thay thế. */
export function SentenceDots({
  statuses,
  currentIndex,
}: {
  statuses: readonly PartStatus[];
  currentIndex: number;
}) {
  const t = useTranslations("lesson");

  return (
    <div
      role="img"
      aria-label={t("dictation.dots.aria", {
        current: currentIndex + 1,
        total: statuses.length,
      })}
      className="mb-3.5 mt-2 flex gap-2"
    >
      {statuses.map((status, i) => (
        <i
          key={i}
          aria-hidden
          className={cn(
            "size-3 rounded-full",
            i === currentIndex
              ? "bg-primary ring-4 ring-ring"
              : status === "done"
                ? "bg-success"
                : status === "skipped"
                  ? "bg-muted-foreground/40"
                  : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

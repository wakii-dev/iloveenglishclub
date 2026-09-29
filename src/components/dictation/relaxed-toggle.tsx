"use client";

import { useTranslations } from "next-intl";
import { cn } from "cn";

/** §3.8 RelaxedToggle — tabs row (chỗ DUY NHẤT, "Settings góc phải"):
 *  chip-toggle strict/relaxed; guest in-memory, user persist qua action
 *  (wire ở orchestrator). */
export function RelaxedToggle({
  relaxed,
  onToggle,
}: {
  relaxed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("lesson");

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={relaxed}
      title={t("dictation.relaxed.description")}
      className={cn(
        "inline-flex items-center rounded-full border-2 px-3 py-1 text-[12.5px] font-extrabold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2",
        relaxed
          ? "border-secondary bg-secondary text-secondary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-secondary hover:text-secondary",
      )}
    >
      {relaxed
        ? t("dictation.relaxed.on")
        : t("dictation.relaxed.off")}
    </button>
  );
}

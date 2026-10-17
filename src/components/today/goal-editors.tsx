"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

/**
 * Goal editors inline (daily-journey SF-3, VU-51 — hand-off §2 + spec
 * §2.1): preset phút 5/15/30 + từ 5/10/20 + free input (phút 5..120, từ
 * 1..100). Phút → PATCH /api/today/goal {minutes}, từ → PATCH
 * /api/vocabulary/goal {goal} CŨ (một field một route — contract giữ
 * nguyên); xong router.refresh() để RSC fetch lại snapshot (pattern
 * dashboard-goal-ring: timeout 10s chống kẹt disabled, Escape/blur, error
 * state). Touch ≥44px (mobile chính 375px).
 */
const MINUTE_PRESETS = [5, 15, 30] as const;
const WORD_PRESETS = [5, 10, 20] as const;

function EditorRow({
  label,
  unit,
  presets,
  current,
  presetAria,
  freeLabel,
  applyLabel,
  onSave,
  saving,
  disabled,
}: {
  label: string;
  unit: string;
  presets: readonly number[];
  current: number;
  presetAria: (value: number) => string;
  freeLabel: string;
  applyLabel: string;
  onSave: (value: number) => Promise<void>;
  saving: boolean;
  disabled: boolean;
}) {
  const [free, setFree] = useState("");

  return (
    <div>
      <p className="text-[12px] font-bold text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={current === preset}
            aria-label={presetAria(preset)}
            disabled={saving || disabled}
            onClick={() => void onSave(preset)}
            className={`min-h-[44px] min-w-11 rounded-[12px] border-[1.5px] px-3 text-[14px] font-extrabold tabular-nums ${
              current === preset
                ? "border-secondary bg-secondary text-secondary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            } disabled:opacity-60`}
          >
            {preset}
          </button>
        ))}
        <span className="ml-1 flex items-center gap-1">
          <input
            type="number"
            inputMode="numeric"
            aria-label={freeLabel}
            placeholder={String(current)}
            value={free}
            disabled={saving || disabled}
            onChange={(e) => setFree(e.target.value)}
            className="h-[44px] w-[74px] rounded-[12px] border-[1.5px] border-input bg-card px-2.5 text-center text-[14px] font-extrabold tabular-nums outline-none focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60"
          />
          <button
            type="button"
            aria-label={applyLabel}
            disabled={
              saving || disabled || free.trim() === "" || Number(free) === current
            }
            onClick={() => void onSave(Number(free))}
            className="min-h-[44px] rounded-[12px] border-[1.5px] border-border bg-muted px-3 text-[13px] font-extrabold text-foreground hover:bg-accent disabled:opacity-40"
          >
            →
          </button>
        </span>
        <span className="text-[12px] font-semibold text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  );
}

export function GoalEditors({
  minutes,
  words,
}: {
  minutes: number;
  words: number;
}) {
  const t = useTranslations("today");
  const router = useRouter();
  const [saving, setSaving] = useState<"minutes" | "words" | null>(null);
  const [error, setError] = useState(false);

  async function save(kind: "minutes" | "words", value: number) {
    setSaving(kind);
    setError(false);
    try {
      // timeout 10s — hang request kẹt nút disabled vô hạn (pattern
      // dashboard-goal-ring review B Q2)
      const res = await fetch(
        kind === "minutes" ? "/api/today/goal" : "/api/vocabulary/goal",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "minutes" ? { minutes: value } : { goal: value },
          ),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) throw new Error(`goal PATCH ${res.status}`);
      router.refresh(); // RSC fetch lại snapshot với goal mới
    } catch (error) {
      console.error("[today:goalEditors] PATCH failed:", error);
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-4 border-t-[1.5px] border-dashed border-border pt-3.5">
      <p className="text-[13px] font-extrabold text-secondary">
        {t("hero.editGoals")}
      </p>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        <EditorRow
          label={t("goalEditor.minutesLabel")}
          unit={t("goalEditor.minutesUnit")}
          presets={MINUTE_PRESETS}
          current={minutes}
          presetAria={(v) => t("goalEditor.minutesPresetAria", { value: v })}
          freeLabel={t("goalEditor.minutesFreeLabel")}
          applyLabel={t("goalEditor.apply")}
          onSave={(v) => save("minutes", v)}
          saving={saving === "minutes"}
          disabled={saving === "words"}
        />
        <EditorRow
          label={t("goalEditor.wordsLabel")}
          unit={t("goalEditor.wordsUnit")}
          presets={WORD_PRESETS}
          current={words}
          presetAria={(v) => t("goalEditor.wordsPresetAria", { value: v })}
          freeLabel={t("goalEditor.wordsFreeLabel")}
          applyLabel={t("goalEditor.apply")}
          onSave={(v) => save("words", v)}
          saving={saving === "words"}
          disabled={saving === "minutes"}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-bold text-destructive">
          {t("goalEditor.saveError")}
        </p>
      ) : null}
    </div>
  );
}

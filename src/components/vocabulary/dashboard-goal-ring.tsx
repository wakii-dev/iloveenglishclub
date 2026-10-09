"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

/**
 * Goal ring + editor inline (vocab-memrise SF-4, VU-41 — hand-off §2.1/§3):
 * donut 74px coral (stroke-dasharray), nút "Sửa mục tiêu ▾" mở popover
 * presets 5/10/20 (preset đang chọn nền teal, aria-expanded/aria-pressed),
 * chọn → PATCH /api/vocabulary/goal (validate 1..100 phía server) → đóng +
 * router.refresh() để RSC fetch lại summary. Đóng khi blur/Escape.
 * A11y: ring role="img" aria-label tỉ số (text alternative — acceptance #6).
 */
const GOAL_PRESETS = [5, 10, 20] as const;
const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // 188.5 như proto

export function DashboardGoalRing({
  planted,
  goal,
}: {
  planted: number;
  goal: number;
}) {
  const t = useTranslations("vocabulary");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  const ratio = goal > 0 ? Math.min(1, planted / goal) : 1;
  const dash = ratio * RING_CIRCUMFERENCE;

  async function pick(value: number) {
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/vocabulary/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: value }),
      });
      if (!res.ok) throw new Error(`goal PATCH ${res.status}`);
      setOpen(false);
      router.refresh(); // RSC fetch lại summary với goal mới
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <div
        className="relative h-[74px] w-[74px]"
        role="img"
        aria-label={t("hub.dash.goalRingAria", { planted, goal })}
      >
        <svg viewBox="0 0 74 74" aria-hidden="true" className="block h-full w-full">
          <circle
            cx="37"
            cy="37"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          <circle
            cx="37"
            cy="37"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
            transform="rotate(-90 37 37)"
            className="stroke-primary transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-[17px] font-extrabold tabular-nums">
          {planted}/{goal}
        </span>
      </div>
      <span className="mt-1 block text-[11.5px] leading-tight text-muted-foreground">
        {t("hub.dash.goalCardLabel")}
      </span>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 min-h-8 text-[12px] font-extrabold text-secondary hover:underline"
      >
        {t("hub.dash.goalEdit")}
      </button>

      {open ? (
        <div
          id={popId}
          role="group"
          aria-label={t("hub.dash.goalPopLabel")}
          className="mt-2 rounded-[14px] border-2 border-dashed border-gold-soft-line p-2 text-[12px] text-muted-foreground"
        >
          {t("hub.dash.goalEachDay")}
          <span className="mt-1.5 flex justify-center gap-1.5">
            {GOAL_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={goal === preset}
                disabled={saving}
                onClick={() => void pick(preset)}
                className={`min-h-[34px] min-w-10 rounded-[10px] border-[1.5px] text-[13px] font-extrabold ${
                  goal === preset
                    ? "border-secondary bg-secondary text-secondary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {preset}
              </button>
            ))}
          </span>
          {error ? (
            <p className="mt-1.5 text-center font-bold text-destructive">
              {t("hub.dash.goalSaveError")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from "react";

/**
 * Donut goal-ring cho hero /today (daily-journey SF-3, VU-51 — hand-off §1
 * "Ring theo pattern dashboard-goal-ring"): donut role="img" aria-label tỉ
 * số, stroke-dasharray + motion-safe transition (prefers-reduced-motion
 * respect). 92px (hero 2 ring cạnh nhau — lớn hơn ring 74px dashboard).
 */
const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 238.76

export function GoalRing({
  done,
  goal,
  label,
  ariaLabel,
  strokeClass,
  children,
}: {
  done: number;
  goal: number;
  /** Nhãn dưới ring (vd "Phút nghe"). */
  label: ReactNode;
  /** aria-label tỉ số (role="img" — text alternative). */
  ariaLabel: string;
  /** Màu vòng tiến độ (stroke-* token hệ). */
  strokeClass: string;
  /** Nội dung giữa donut (số done). */
  children?: ReactNode;
}) {
  const ratio = goal > 0 ? Math.min(1, done / goal) : 1;
  const dash = ratio * RING_CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative h-[92px] w-[92px]"
      >
        <svg
          viewBox="0 0 92 92"
          aria-hidden="true"
          className="block h-full w-full"
        >
          <circle
            cx="46"
            cy="46"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="9"
            className="stroke-muted"
          />
          <circle
            cx="46"
            cy="46"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
            transform="rotate(-90 46 46)"
            className={`${strokeClass} motion-safe:transition-[stroke-dasharray] motion-safe:duration-500`}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-[20px] font-extrabold tabular-nums">
          {children}
        </span>
      </div>
      <span className="text-[12px] font-bold text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

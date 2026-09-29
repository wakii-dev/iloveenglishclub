"use client";

/** §3.9 ProgressBar (design §1.9): 10px pill, fill secondary = done/total
 *  (skip KHÔNG tính done — lessonProgress SF-3). */
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-[10px] overflow-hidden rounded-full border-2 border-border bg-muted"
    >
      <span
        className="block h-full rounded-full bg-secondary transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

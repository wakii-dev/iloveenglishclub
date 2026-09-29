import type { ReactNode } from "react";

/** Stat tile (/me + tái dùng) — số Baloo tabular-nums, label muted (hand-off
 *  §1.3: số liệu luôn tabular-nums). */
export function StatsCards({
  items,
  columns = 5,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: number;
}) {
  return (
    <dl
      className="grid gap-3.5"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[18px] border-2 border-border bg-card px-4 py-3.5"
        >
          <dd className="font-display text-[24px] leading-tight font-bold text-secondary tabular-nums">
            {item.value}
          </dd>
          <dt className="mt-0.5 text-[12px] font-bold text-muted-foreground">
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}

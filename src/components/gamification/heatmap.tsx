import { addDays } from "@/lib/gamification/streak";

/**
 * Heatmap 12 tuần (context pack #6) — grid GitHub-style: cột = tuần (Mon→Sun
 * trục dọc), 84 ngày kết thúc tại hôm nay (TZ Asia/Ho_Chi_Minh). Màu fill
 * color-mix(--secondary) giữ nguyên dạng để tự thích ứng dark mode (hand-off
 * §1.8). A11y theo hand-off (§3 — aria-hidden + text thay thế): grid ẩn với
 * screen reader, summary sr-only thay thế.
 */

const WEEKS = 12;

function intensityOf(partsDone: number): number {
  if (partsDone <= 0) return 0;
  if (partsDone <= 2) return 35;
  if (partsDone <= 5) return 65;
  return 100;
}

export function Heatmap({
  activity,
  today,
  labels,
}: {
  /** daily_activity trong cửa sổ 84 ngày (query SF-6 đã lọc). */
  activity: { date: string; partsDone: number }[];
  /** Hôm nay TZ Asia/Ho_Chi_Minh (YYYY-MM-DD) — pass từ server để pure. */
  today: string;
  labels: {
    legendLess: string;
    legendMore: string;
    cellAria: string; // "{date} · {parts}" — tooltip từng ô (replace ở đây)
    summary: string; // "{days} ngày · {parts} phần trong 12 tuần" — sr-only
  };
}) {
  const byDate = new Map(activity.map((a) => [a.date, a.partsDone]));
  // Thứ 2 của tuần hiện tại → cột cuối; lùi 11 tuần → grid trọn 12 cột
  const todayDow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=Mon
  const lastMonday = addDays(today, -todayDow);
  const start = addDays(lastMonday, -(WEEKS - 1) * 7);

  const weeks: { date: string; partsDone: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col: { date: string; partsDone: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      col.push({
        date,
        partsDone: byDate.get(date) ?? 0,
        future: date > today,
      });
    }
    weeks.push(col);
  }

  const totalParts = activity.reduce((s, a) => s + a.partsDone, 0);

  return (
    <div>
      <p className="sr-only">
        {labels.summary
          .replace("{days}", String(activity.length))
          .replace("{parts}", String(totalParts))}
      </p>
      <div className="flex gap-[3px] overflow-x-auto" aria-hidden="true">
        {weeks.map((col, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <span
                key={cell.date}
                title={
                  cell.future
                    ? undefined
                    : labels.cellAria
                        .replace("{date}", cell.date)
                        .replace("{parts}", String(cell.partsDone))
                }
                className="size-[11px] rounded-[3px] border border-border"
                style={{
                  background: cell.future
                    ? "transparent"
                    : `color-mix(in srgb, var(--secondary) ${
                        intensityOf(cell.partsDone)
                      }%, var(--muted))`,
                  opacity: cell.future ? 0.35 : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[11.5px] font-bold text-muted-foreground">
        <span aria-hidden="true">{labels.legendLess}</span>
        {[0, 35, 65, 100].map((level) => (
          <span
            key={level}
            aria-hidden="true"
            className="size-[10px] rounded-[3px] border border-border"
            style={{
              background: `color-mix(in srgb, var(--secondary) ${level}%, var(--muted))`,
            }}
          />
        ))}
        <span aria-hidden="true">{labels.legendMore}</span>
      </div>
    </div>
  );
}

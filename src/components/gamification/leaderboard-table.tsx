import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LeaderboardRow } from "@/lib/gamification/queries";

/** Vàng/bạc/đồng — accent tĩnh, không phụ thuộc dark mode (hand-off §1.7 style). */
const MEDAL = ["#f59e0b", "#94a3b8", "#b45309"] as const;

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Bảng xếp hạng /top-users (context pack #5): avatar + display_name + xp.
 *  valueSuffix: hậu tố giá trị (vd "%" cho cột Điểm quiz SF-4) — không đụng style. */
export function LeaderboardTable({
  rows,
  labels,
  valueSuffix,
}: {
  rows: LeaderboardRow[];
  labels: { rank: string; player: string; xp: string; empty: string; anonymous: string; medalAria: string };
  valueSuffix?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[14px] border-2 border-dashed border-border p-5 text-center text-[14px] font-semibold text-muted-foreground">
        {labels.empty}
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-muted-foreground">
          <th scope="col" className="w-12 px-3 py-2">{labels.rank}</th>
          <th scope="col" className="px-3 py-2">{labels.player}</th>
          <th scope="col" className="px-3 py-2 text-right tabular-nums">{labels.xp}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={`${row.displayName ?? "anon"}-${i}`}
            className="border-t-2 border-border"
          >
            <td className="px-3 py-2.5">
              {i < 3 ? (
                <span
                  aria-label={labels.medalAria.replace("{rank}", String(i + 1))}
                  className="inline-flex size-7 items-center justify-center rounded-full text-[13px] font-extrabold text-white"
                  style={{ background: MEDAL[i] }}
                >
                  {i + 1}
                </span>
              ) : (
                <span className="pl-2.5 text-[14px] font-bold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
              )}
            </td>
            <td className="px-3 py-2.5">
              <span className="flex items-center gap-2.5">
                <Avatar className="size-7">
                  {row.avatarUrl ? (
                    <AvatarImage src={row.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-secondary text-[10.5px] font-extrabold text-secondary-foreground">
                    {row.displayName ? initialsOf(row.displayName) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-[14.5px] font-bold">
                  {row.displayName || labels.anonymous}
                </span>
              </span>
            </td>
            <td className="px-3 py-2.5 text-right text-[15px] font-extrabold text-secondary tabular-nums">
              {row.xp.toLocaleString("vi-VN")}
              {valueSuffix ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

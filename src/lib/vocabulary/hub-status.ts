/**
 * Hub pure helpers (SF-1 t-1.2) — phần KHÔNG db/next của tab Tổng quan,
 * client-safe (hub-filters.tsx import được mà không kéo @/db vào bundle —
 * cùng tách lớp srs.ts ⋈ review-store.ts). Thành thạo = reps ≥
 * MASTERED_REPS (3 lần ôn thành công liên tiếp, SM-2 lite srs.ts: rep1=1d,
 * rep2=6d, rep3+ interval giãn theo ease).
 */

export const MASTERED_REPS = 3;

export type HubStatusFilter = "all" | "due" | "mastered" | "learning";

export const HUB_STATUSES: readonly HubStatusFilter[] = [
  "all",
  "due",
  "mastered",
  "learning",
];

/** Chuẩn hoá searchParams thô → filter type-safe (giá trị lạ → mặc định). */
export function parseHubFilters(raw: {
  book?: string;
  status?: string;
}): { bookId: number | null; status: HubStatusFilter } {
  const bookId =
    raw.book && /^\d+$/.test(raw.book) ? Number.parseInt(raw.book, 10) : null;
  const status = (HUB_STATUSES as readonly string[]).includes(raw.status ?? "")
    ? (raw.status as HubStatusFilter)
    : "all";
  return { bookId, status };
}

/** Trạng thái hiển thị 1 hàng: due đè lên mastered/learning (mốc thời gian). */
export function displayStatus(
  row: { reps: number; dueAt: Date },
  now: Date = new Date(),
): "due" | "mastered" | "learning" {
  if (row.dueAt.getTime() <= now.getTime()) return "due";
  return row.reps >= MASTERED_REPS ? "mastered" : "learning";
}

/**
 * Hub pure helpers (SF-1 t-1.2) — phần KHÔNG db/next của tab Tổng quan,
 * client-safe (hub-filters.tsx import được mà không kéo @/db vào bundle —
 * cùng tách lớp srs.ts ⋈ review-store.ts). Thành thạo = reps ≥
 * MASTERED_REPS (3 lần ôn thành công liên tiếp, SM-2 lite srs.ts: rep1=1d,
 * rep2=6d, rep3+ interval giãn theo ease).
 */
import { localize } from "@/lib/content/localize";
import { parseQuizScope, type QuizScope } from "./quiz";

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

/** Tab hub đang mở (SF-2 t-2.2) — guest không có Tổng quan → rơi vào Thư viện. */
export type HubTab = "overview" | "library" | "review" | "quiz";

export function resolveHubTab(raw: string, loggedIn: boolean): HubTab {
  if (raw === "library" || raw === "review" || raw === "quiz") return raw;
  return loggedIn ? "overview" : "library";
}

/** Filter tab Thư viện (SF-2 t-2.1) — status chỉ áp dụng cho user đăng nhập. */
export type LibraryFilters = {
  search: string;
  bookId: number | null;
  hasAudio: boolean;
  status: HubStatusFilter;
  page: number; // 1-based
};

export function parseLibraryFilters(raw: {
  search?: string;
  book?: string;
  audio?: string;
  status?: string;
  page?: string;
}): LibraryFilters {
  const search = (raw.search ?? "").trim().slice(0, 100);
  const bookId =
    raw.book && /^\d+$/.test(raw.book) ? Number.parseInt(raw.book, 10) : null;
  const status = (HUB_STATUSES as readonly string[]).includes(raw.status ?? "")
    ? (raw.status as HubStatusFilter)
    : "all";
  const page =
    raw.page && /^\d+$/.test(raw.page)
      ? Math.max(1, Number.parseInt(raw.page, 10))
      : 1;
  return { search, bookId, hasAudio: raw.audio === "1", status, page };
}

/** `_` `%` `\` trong search là literal — escape trước khi nhúng vào LIKE. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

/** URL tab Thư viện giữ filter, đặt page (page 1 bỏ param cho URL gọn). */
export function libraryHref(filter: LibraryFilters, page: number): string {
  const params = new URLSearchParams({ tab: "library" });
  if (filter.search !== "") params.set("search", filter.search);
  if (filter.bookId !== null) params.set("book", String(filter.bookId));
  if (filter.hasAudio) params.set("audio", "1");
  if (filter.status !== "all") params.set("status", filter.status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/vocabulary${qs ? `?${qs}` : ""}`;
}

/** Danh sách book của 1 hàng ("—" khi từ độc lập) — dùng chung 2 tab. */
export function formatBookTitles(
  locale: string,
  books: { titleEn: string; titleVi: string | null }[],
): string {
  return books.length === 0
    ? "—"
    : books
        .map((b) => localize(locale, { en: b.titleEn, vi: b.titleVi }))
        .join(", ");
}

/**
 * Filter tab Quiz (SF-3 t-3.2) — ?scope=all | ?scope=book&book=<id> |
 * ?scope=multi&books=1,2. Vắng/không hợp lệ → picker (URL lạ không vỡ trang,
 * khách chỉ thấy lại form chọn phạm vi).
 */
export type QuizTabFilter =
  | { kind: "picker" }
  | { kind: "quiz"; scope: QuizScope };

export function parseQuizTabFilters(raw: {
  scope?: string;
  book?: string;
  books?: string;
}): QuizTabFilter {
  if (!raw.scope) return { kind: "picker" };
  const parsed = parseQuizScope({
    scope: raw.scope,
    bookId: raw.book,
    bookIds: raw.books,
  });
  return parsed.ok ? { kind: "quiz", scope: parsed.scope } : { kind: "picker" };
}

/** Trạng thái hiển thị 1 hàng: due đè lên mastered/learning (mốc thời gian). */
export function displayStatus(
  row: { reps: number; dueAt: Date },
  now: Date = new Date(),
): "due" | "mastered" | "learning" {
  if (row.dueAt.getTime() <= now.getTime()) return "due";
  return row.reps >= MASTERED_REPS ? "mastered" : "learning";
}

/** Màu chip trạng thái (dùng chung 2 tab hub) — due đè màu primary. */
export function hubStatusChipClass(
  status: "due" | "mastered" | "learning",
): string {
  if (status === "due") return "text-primary";
  if (status === "mastered") return "text-secondary";
  return "text-muted-foreground";
}

/**
 * Streak + ngày theo TZ — pure module SF-6 (context pack #2, CHỐT CỨNG).
 * TZ cố định Asia/Ho_Chi_Minh (quyết định #13 — tệp người học VN, không DST).
 * Source of truth là daily_activity; profiles.streak_count chỉ là CACHE —
 * server action recompute bằng computeStreak sau khi upsert ngày hôm nay.
 */

export const ILEC_TZ = "Asia/Ho_Chi_Minh";

const VN_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ILEC_TZ, // en-CA → định dạng YYYY-MM-DD
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày (YYYY-MM-DD) tại thời điểm `now` theo TZ Asia/Ho_Chi_Minh. */
export function vnToday(now: Date): string {
  return VN_DATE_FMT.format(now);
}

/** Cộng/trừ n ngày trên chuỗi YYYY-MM-DD (pure — không Date locale drift). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Streak = số ngày LIÊN TIẾP tính lùi từ `today` (đã học hôm nay) hoặc từ
 * hôm qua (chưa học hôm nay — chuỗi vẫn "còn sống" đến cuối ngày).
 * 3 case contract: hôm qua → +1 · hôm nay → giữ (recompute idempotent) ·
 * cách >1 ngày → reset 1. Duplicate dates (race upsert) không đếm kép.
 */
export function computeStreak(
  dates: readonly string[],
  today: string,
): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

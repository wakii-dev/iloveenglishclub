/**
 * Event client-side SF-6: submit-attempt thành công → dispatch window event
 * → UserMenu (header) re-fetch XP/streak ("XP header live" — context pack #8).
 * Window CustomEvent — không thêm state manager cho 1 đường thông báo.
 */

export const STATS_UPDATED_EVENT = "ilec:stats-updated";

export function notifyStatsUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT));
  }
}

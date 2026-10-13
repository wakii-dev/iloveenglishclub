/**
 * Shield-planner thuần — daily-journey SF-1 (VU-49, epic spec §2.3). Tính
 * KẾ HOẠCH freeze cho streak shield: duyệt lùi từ HÔM QUA trong window
 * `lookback` ngày, ngày không có daily_activity row + credits còn → freeze.
 * KHÔNG DB — caller (recomputeStreakTx, SF-4 wiring) đọc credits từ
 * profiles, INSERT streak_freezes theo freezeDates rồi trừ creditsLeft.
 *
 * ⚠ CONTRACT CALLER (SF-4): `dates` phải là ngày active HIỆU LỰC = ngày có
 * daily_activity row CỘNG ngày đã có row streak_freezes (freeze cũ không nằm
 * trong daily_activity — không merge thì lần recompute sau planner freeze
 * LẠI cùng ngày: INSERT idempotent theo PK nhưng credits bị trừ lần 2).
 *
 * Semantics lookback = calendar-window (hôm-qua..hôm-trước-`lookback`):
 * bounded O(lookback) mỗi write-path, không quét lịch sử; hố sâu hơn window
 * không bao giờ bị freeze. Prose spec "7 ngày gap" mơ hồ — quyết định + pin
 * test ghi REQUIREMENT-GAP epic VU-48.
 */

// Pure module cùng thư mục streak.ts — tái dùng addDays (không copy TZ
// logic, đúng convention daily-goal.ts).
import { addDays } from "./streak";

export const SHIELD_CAP = 2; // cap tích credits (grant rule least(x+1, 2))
export const SHIELD_LOOKBACK = 7; // window ngày xét lùi từ hôm qua

export interface FreezePlan {
  /** Ngày (YYYY-MM-DD) cần INSERT streak_freezes — gần nhất trước. */
  freezeDates: string[];
  /** Credits còn lại sau khi freeze (caller UPDATE profiles.shield_credits). */
  creditsLeft: number;
}

export function planFreezes(
  dates: readonly string[],
  today: string,
  credits: number,
  cap: number = SHIELD_CAP,
  lookback: number = SHIELD_LOOKBACK,
): FreezePlan {
  const active = new Set(dates);
  const freezeDates: string[] = [];
  let creditsLeft = Math.max(0, credits);
  for (let offset = 1; offset <= lookback; offset++) {
    if (creditsLeft === 0 || freezeDates.length >= cap) break;
    const day = addDays(today, -offset);
    if (!active.has(day)) {
      freezeDates.push(day);
      creditsLeft -= 1;
    }
  }
  return { freezeDates, creditsLeft };
}

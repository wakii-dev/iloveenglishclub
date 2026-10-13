/**
 * Today-engine thuần — daily-journey SF-1 (VU-49, epic spec §2.2): goal
 * KÉP "X phút nghe dictation + Y từ ôn/luyện". Bọc goalStatus vocab hai
 * lần + trạng thái both. Day boundary là việc CALLER (vnToday — pattern
 * daily-goal.ts); module thuần, không DB.
 *
 * ⚠ NGHĨA `plantedToday` (daily-journey): goalStatus giữ nguyên param name
 * (contract VU-38) nhưng đầu vào giờ là practicedToday — SỐ TỪ ÔN/LUYỆN
 * (distinct từ có ≥1 sự kiện đúng hôm nay), không chỉ từ mới planted.
 * Query nguồn là việc today-store (SF-2).
 */

import { goalStatus, type GoalStatus } from "@/lib/vocabulary/daily-goal";

export interface DualGoalInput {
  /** Số phút nghe hôm nay (= daily_activity.listen_ms / 60000, floor). */
  minutesToday: number;
  /** profiles.daily_goal_minutes (preset 5..120). */
  goalMinutes: number;
  /** practicedToday — distinct từ ôn/luyện ĐÚNG hôm nay (learn + review). */
  practicedToday: number;
  /** profiles.daily_goal_words (preset 1..100). */
  goalWords: number;
}

export interface DualGoalStatus {
  minutes: GoalStatus;
  words: GoalStatus;
  /** GoalDone kép = cả 2 nhánh đạt — điều kiện tắt nav dot (SF-3). */
  both: boolean;
}

export function dualGoalStatus(input: DualGoalInput): DualGoalStatus {
  // goalStatus thuần kẹp âm→0, pct floor, goal 0 = xong — tái dùng, không copy
  const minutes = goalStatus({
    plantedToday: input.minutesToday,
    goal: input.goalMinutes,
  });
  const words = goalStatus({
    plantedToday: input.practicedToday,
    goal: input.goalWords,
  });
  return { minutes, words, both: minutes.done && words.done };
}

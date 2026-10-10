/**
 * Daily goal helper (vocab-memrise SF-1, VU-38 — epic spec §2.3). PURE —
 * so sánh plantedToday (từ mới planted hôm nay) với profiles.daily_goal_words.
 * Day boundary là việc CALLER: đếm plantedToday theo ngày VN qua
 * vnToday/ILEC_TZ từ src/lib/gamification/streak.ts — TÁI DÙNG, không copy
 * (same TZ Asia/Ho_Chi_Minh, quyết định #13).
 */

export type GoalStatus = {
  /** plantedToday >= goal — goal ring đầy. */
  done: boolean;
  /** Còn bao nhiêu từ nữa — 0 khi xong. */
  remaining: number;
  /** % hoàn thành nguyên (floor), kẹp 100 — goal 0 coi như xong. */
  pct: number;
};

export function goalStatus({
  plantedToday,
  goal,
}: {
  plantedToday: number;
  goal: number;
}): GoalStatus {
  const planted = Math.max(0, plantedToday);
  const target = Math.max(0, goal);
  const done = planted >= target;
  return {
    done,
    remaining: Math.max(0, target - planted),
    pct: target === 0 ? 100 : Math.min(100, Math.floor((planted / target) * 100)),
  };
}

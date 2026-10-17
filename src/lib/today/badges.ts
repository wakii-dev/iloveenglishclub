/**
 * Badge defs + eval thuần — daily-journey SF-1 (VU-49, epic spec §2.5).
 * Pool milestone tĩnh; evalBadges(stats) trả MỌI mốc đạt (snapshot tx SF-2
 * lazy-award: INSERT user_badges ON CONFLICT DO NOTHING RETURNING — không
 * double-award). Thứ tự kết quả = thứ tự pool (UI strip ổn định).
 *
 * Nguồn số liệu (SF-2 snapshot build): streak = profiles.streak_count ·
 * activeDays = COUNT daily_activity · wordsLearned = COUNT
 * user_word_progress reps≥1 · listenMinutes = getMyStats listenMinutes
 * ALL-TIME (KHÔNG phải tổng listen_ms) · questsCompleted = COUNT
 * quest_completions. 2 COUNT all-time là query riêng — KHÔNG load rows.
 *
 * Pool = enumeration spec §2.5 ĐỦ 15 id (prose "13" là miscount —
 * REQUIREMENT-GAP epic VU-48). i18n keys `badges.<badgeId>.*` do SF-3 điền.
 */

export type BadgeMetric =
  | "streak"
  | "activeDays"
  | "wordsLearned"
  | "listenMinutes"
  | "questsCompleted";

export interface BadgeDef {
  badgeId: string;
  metric: BadgeMetric;
  milestone: number;
}

export type BadgeStats = Record<BadgeMetric, number>;

export const BADGE_POOL: readonly BadgeDef[] = [
  { badgeId: "streak-3", metric: "streak", milestone: 3 },
  { badgeId: "streak-7", metric: "streak", milestone: 7 },
  { badgeId: "streak-30", metric: "streak", milestone: 30 },
  { badgeId: "streak-100", metric: "streak", milestone: 100 },
  { badgeId: "active-days-10", metric: "activeDays", milestone: 10 },
  { badgeId: "active-days-50", metric: "activeDays", milestone: 50 },
  { badgeId: "active-days-200", metric: "activeDays", milestone: 200 },
  { badgeId: "words-learned-10", metric: "wordsLearned", milestone: 10 },
  { badgeId: "words-learned-100", metric: "wordsLearned", milestone: 100 },
  { badgeId: "words-learned-1000", metric: "wordsLearned", milestone: 1000 },
  { badgeId: "listen-60", metric: "listenMinutes", milestone: 60 },
  { badgeId: "listen-600", metric: "listenMinutes", milestone: 600 },
  { badgeId: "quests-5", metric: "questsCompleted", milestone: 5 },
  { badgeId: "quests-25", metric: "questsCompleted", milestone: 25 },
  { badgeId: "quests-100", metric: "questsCompleted", milestone: 100 },
];

/** Mọi badge đạt (>= mốc) theo thứ tự pool — thuần, không side-effect. */
export function evalBadges(stats: BadgeStats): string[] {
  return BADGE_POOL.filter((b) => stats[b.metric] >= b.milestone).map(
    (b) => b.badgeId,
  );
}

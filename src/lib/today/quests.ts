/**
 * Quest defs + selection thuần — daily-journey SF-1 (VU-49, epic spec §2.4
 * CHỐT CỨNG). Pool 7 quest; mỗi ngày chọn ĐÚNG 3 deterministic theo hash —
 * KHÔNG Math.random, KHÔNG DB, cùng (userId, date) → cùng 3 quest mọi
 * render/restart/server.
 *
 * Selection (pinned): hash = SHA-256(`${userId}:${date}`) hex; key mỗi quest
 * = hash-slice-8byte của SHA-256(`${hash}${questId}`) (16 hex đầu — so sánh
 * hex lowercase ≡ so sánh byte, monotonic); sort asc → 3 đầu. Đọc naive
 * "slice 16 ký tự của `${hash}${questId}`" là DEGENERATE (16 ký tự đầu đều
 * thuộc hash 64 ký tự → mọi quest cùng key → stable sort trả 3 quest đầu
 * pool) — đã loại bằng oracle script, ghi REQUIREMENT-GAP epic VU-48.
 *
 * Defs CHỈ id + target + metric (predicate trên TodaySnapshot — SF-2 dựng
 * progress). Tên/mô tả = i18n keys `today.json` `quests.<questId>.*` (SF-3
 * điền vi/en) — KHÔNG nằm ở đây.
 *
 * ⚠ SERVER-ONLY import: file dùng `node:crypto` — SF-3 đừng import
 * QUEST_POOL/QuestId từ client component (Next build vỡ — không polyfill).
 * Muốn pool ở client thì tách defs ra file thuần không crypto.
 */

import { createHash } from "node:crypto";

export type QuestId =
  | "q-parts-3"
  | "q-parts-5"
  | "q-listen-goal"
  | "q-review-5"
  | "q-plant-3"
  | "q-goal-words"
  | "q-goal-dual";

/**
 * Target tĩnh (số) hoặc resolve-từ-snapshot ("goalMinutes" →
 * TodaySnapshot.dailyGoalMinutes, "goalWords" → dailyGoalWords) — quest
 * theo goal người dùng không có mốc cố định.
 */
export type QuestTarget = number | "goalMinutes" | "goalWords";

/** Metric trên TodaySnapshot mà predicate quest đọc (SF-2 map progress). */
export type QuestMetric =
  | "partsToday"
  | "listenGoal"
  | "reviewedToday"
  | "plantedToday"
  | "practicedGoal"
  | "goalDual";

export interface QuestDef {
  questId: QuestId;
  target: QuestTarget;
  metric: QuestMetric;
}

/** Pool 7 quest đúng spec §2.4 — đổi pool = đổi code + i18n key (git). */
export const QUEST_POOL: readonly QuestDef[] = [
  { questId: "q-parts-3", target: 3, metric: "partsToday" },
  { questId: "q-parts-5", target: 5, metric: "partsToday" },
  { questId: "q-listen-goal", target: "goalMinutes", metric: "listenGoal" },
  { questId: "q-review-5", target: 5, metric: "reviewedToday" },
  { questId: "q-plant-3", target: 3, metric: "plantedToday" },
  { questId: "q-goal-words", target: "goalWords", metric: "practicedGoal" },
  // progress = số goal con đạt (0..2), target 2 — spec §2.4
  { questId: "q-goal-dual", target: 2, metric: "goalDual" },
];

/** 3 quest của (userId, date) — đúng thứ tự rank (nearest-key trước). */
export function selectQuests(
  userId: string,
  date: string,
): [QuestId, QuestId, QuestId] {
  const hash = createHash("sha256").update(`${userId}:${date}`).digest("hex");
  const ranked = [...QUEST_POOL].sort(
    (a, b) => compareKeys(questKey(hash, a.questId), questKey(hash, b.questId)),
  );
  return [ranked[0]!.questId, ranked[1]!.questId, ranked[2]!.questId];
}

function questKey(hash: string, questId: QuestId): string {
  return createHash("sha256")
    .update(`${hash}${questId}`)
    .digest("hex")
    .slice(0, 16);
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
